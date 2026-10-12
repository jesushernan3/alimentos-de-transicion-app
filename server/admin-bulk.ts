import crypto from "node:crypto";
import { eq, sql, desc } from "drizzle-orm";
import { adminBulkOperations, licenses, recipes } from "../drizzle/schema";
import { getDb } from "./db";
import { setLicenseStatusById } from "./access";
import { deleteRecipe, setRecipeStatus } from "./catalog-admin";
import { bumpCatalogVersion } from "./catalog";

export type BulkEntity = "recipes" | "licenses";
export type BulkAction = "publish" | "draft" | "unpublish" | "delete" | "revoke" | "archive" | "restore";
export interface BulkInput { ids: number[]; action: BulkAction; operationId: string; confirmation?: string }
export interface BulkItemResult { id: number; outcome: "success" | "unchanged" | "failed"; message?: string }
export interface BulkResult {
  operationId: string; entity: BulkEntity; action: BulkAction; status: "completed" | "failed";
  total: number; succeeded: number; unchanged: number; failed: number; results: BulkItemResult[];
}

export class BulkInputError extends Error {}

/** Canonicaliza el lote sin convertir cadenas ni aceptar IDs fraccionarios. */
export function validateBulkInput(entity: BulkEntity, input: BulkInput): BulkInput {
  const allowed = entity === "recipes" ? ["publish", "draft", "unpublish", "delete"] : ["revoke", "archive", "restore"];
  if (!input || !allowed.includes(input.action)) throw new BulkInputError("La acción masiva no es válida.");
  if (!Array.isArray(input.ids) || !input.ids.length || input.ids.length > 500 ||
      input.ids.some((id) => !Number.isSafeInteger(id) || id <= 0 || id > 2147483647)) {
    throw new BulkInputError("Seleccioná entre 1 y 500 IDs enteros positivos.");
  }
  if (typeof input.operationId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.operationId)) {
    throw new BulkInputError("El identificador de operación no es válido.");
  }
  const confirmation = input.action === "delete" ? "ELIMINAR" : ["revoke", "archive"].includes(input.action) ? "CONFIRMAR" : undefined;
  if (confirmation && input.confirmation !== confirmation) throw new BulkInputError("Confirmá la acción antes de ejecutarla.");
  return { ...input, operationId: input.operationId.toLowerCase(), ids: [...new Set(input.ids)].sort((a, b) => a - b) };
}

function summarize(entity: BulkEntity, input: BulkInput, results: BulkItemResult[], status: BulkResult["status"] = "completed"): BulkResult {
  return { operationId: input.operationId, entity, action: input.action, status, total: results.length,
    succeeded: results.filter((r) => r.outcome === "success").length,
    unchanged: results.filter((r) => r.outcome === "unchanged").length,
    failed: results.filter((r) => r.outcome === "failed").length, results };
}

/**
 * Se reserva la auditoría antes de ejecutar. El mismo UUID siempre identifica
 * el mismo payload. El lock del registro serializa dos envíos simultáneos.
 * Mutaciones, bajas del catálogo, eventos y resultado se confirman juntos.
 * Un error de BD revierte todos los elementos y deja un resultado failed durable.
 * Una interrupción antes del commit deja processing: su replay retoma sin duplicar.
 */
export async function executeAdminBulk(entity: BulkEntity, raw: BulkInput, actor = "panel"): Promise<BulkResult> {
  const input = validateBulkInput(entity, raw);
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible.");
  const requestHash = crypto.createHash("sha256").update(JSON.stringify({ entity, action: input.action, ids: input.ids })).digest("hex");
  await db.insert(adminBulkOperations).values({ operationId: input.operationId, requestHash, entity,
    action: input.action, actor: actor.slice(0, 120), ids: input.ids,
  }).onDuplicateKeyUpdate({ set: { operationId: sql`${adminBulkOperations.operationId}` } });
  const [reserved] = await db.select().from(adminBulkOperations).where(eq(adminBulkOperations.operationId, input.operationId)).limit(1);
  if (!reserved || reserved.requestHash !== requestHash) throw new BulkInputError("Este identificador ya corresponde a otro lote. Volvé a seleccionar la acción.");

  try {
    return await db.transaction(async (tx) => {
      const [operation] = await tx.select().from(adminBulkOperations).where(eq(adminBulkOperations.operationId, input.operationId)).limit(1).for("update");
      if (operation.status !== "processing") return operation.result as BulkResult;
      const results: BulkItemResult[] = [];
      let catalogChanged = false;
      let publishedDelta = 0;
      for (const id of input.ids) {
        if (entity === "recipes") {
          const [recipe] = await tx.select({ id: recipes.id, status: recipes.status }).from(recipes).where(eq(recipes.id, id)).limit(1).for("update");
          if (!recipe) {
            results.push({ id, outcome: input.action === "delete" ? "unchanged" : "failed", message: "La receta no existe." });
            continue;
          }
          const changed = input.action === "delete"
            ? await deleteRecipe(id, tx, true)
            : await setRecipeStatus(id, input.action === "publish" ? "published" : "draft", tx, true);
          catalogChanged ||= changed;
          if (changed) publishedDelta += Number(input.action === "publish") - Number(recipe.status === "published");
          results.push({ id, outcome: changed ? "success" : "unchanged" });
        } else {
          const [license] = await tx.select().from(licenses).where(eq(licenses.id, id)).limit(1).for("update");
          if (!license) { results.push({ id, outcome: "failed", message: "La licencia no existe." }); continue; }
          let changed: boolean;
          if (input.action === "revoke") {
            changed = await setLicenseStatusById(id, "revoked", tx, "panel", `Lote ${input.operationId}; ${operation.actor}`);
          } else {
            changed = input.action === "archive" ? !license.archivedAt : Boolean(license.archivedAt);
            if (changed) await tx.update(licenses).set({ archivedAt: input.action === "archive" ? new Date() : null }).where(eq(licenses.id, id));
          }
          results.push({ id, outcome: changed ? "success" : "unchanged" });
        }
      }
      if (catalogChanged) await bumpCatalogVersion(tx, publishedDelta);
      const result = summarize(entity, input, results);
      await tx.update(adminBulkOperations).set({ status: "completed", completedAt: new Date(),
        succeeded: result.succeeded, unchanged: result.unchanged, failed: result.failed, result,
      }).where(eq(adminBulkOperations.operationId, input.operationId));
      return result;
    });
  } catch {
    // No devolver detalles de SQL, conexiones ni credenciales al navegador.
    // Ante un commit de resultado ambiguo, leer su auditoría antes de clasificar:
    // nunca sobrescribir un resultado completed confirmado por otra petición.
    return db.transaction(async (tx) => {
      const [operation] = await tx.select().from(adminBulkOperations).where(eq(adminBulkOperations.operationId, input.operationId)).limit(1).for("update");
      if (operation.status !== "processing") return operation.result as BulkResult;
      const result = summarize(entity, input, input.ids.map((id) => ({ id, outcome: "failed", message: "El lote se revirtió; no se aplicaron cambios. Probá con una nueva operación." })), "failed");
      await tx.update(adminBulkOperations).set({ status: "failed", completedAt: new Date(), failed: result.failed, result }).where(eq(adminBulkOperations.operationId, input.operationId));
      console.error("[admin-bulk] Lote revertido", input.operationId);
      return result;
    });
  }
}

export async function listAdminBulkOperations() {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible.");
  return db.select({ operationId: adminBulkOperations.operationId, entity: adminBulkOperations.entity,
    action: adminBulkOperations.action, actor: adminBulkOperations.actor, ids: adminBulkOperations.ids,
    status: adminBulkOperations.status, succeeded: adminBulkOperations.succeeded, unchanged: adminBulkOperations.unchanged,
    failed: adminBulkOperations.failed, createdAt: adminBulkOperations.createdAt, completedAt: adminBulkOperations.completedAt,
  }).from(adminBulkOperations).orderBy(desc(adminBulkOperations.createdAt)).limit(50);
}

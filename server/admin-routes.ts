/**
 * Rutas HTTP del panel administrativo.
 *
 * El panel es una aplicación web independiente de la app móvil: se sirve en
 * `/admin` como HTML con JavaScript del lado del cliente, y consume estas
 * rutas JSON. Se eligió así, en lugar de sumarlo al proyecto Expo, porque el
 * panel es una herramienta interna de escritorio con necesidades muy distintas
 * a las de la aplicación.
 */

import type { Express, Request, Response } from "express";

import { BulkInputError, executeAdminBulk, listAdminBulkOperations, type BulkEntity } from "./admin-bulk";
import {
  adminAuditActor,
  checkPassword,
  endAdminSession,
  isAdminConfigured,
  isAuthenticated,
  requireAdmin,
  startAdminSession,
} from "./admin-auth";
import {
  adminDashboard,
  createRecipe,
  deleteCollection,
  deleteRecipe,
  duplicateRecipe,
  getRecipeForEdit,
  listCollectionsForAdmin,
  listRecipesForAdmin,
  listTaxonomyForAdmin,
  setRecipeStatus,
  updateRecipe,
  upsertCategory,
  upsertDietTag,
} from "./catalog-admin";
import {
  grantLicense,
  licenseSummary,
  listPendingCodes,
  listUsersWithLicenses,
  setLicenseStatus,
} from "./access";
import { applyImport, CSV_TEMPLATE, exportCsv, validateCsv } from "./csv-import";
import { bulkGrantLicenses } from "./bulk-licenses";
import { listLicenseDevices, reactivateLicenseDevice, revokeLicenseDevice } from "./device-access";
import { isEmailProviderConfigured } from "./mailer";
import { uploadCatalogImage } from "./image-upload";
import { saveCollectionFromAdmin } from "./collection-editor";
import {
  addRecipePhoto,
  deleteRecipePhoto,
  ensureCoverPhotoFromRecipe,
  listRecipePhotos,
  reorderRecipePhotos,
  replaceRecipePhoto,
  setRecipeCover,
} from "./recipe-photos";
import { renderAdminPage } from "./admin-html";
import { retryShopifyDeliveryEmail } from "./shopify-delivery-email";
import {
  getShopifyReconciliationStatus,
  reconcileRecentShopifyOrders,
  reconcileShopifyOrder,
} from "./shopify-reconciliation";
import {
  getShopifyReconciliationMonitoringStatus,
  simulateAutomaticReconciliationFailure,
} from "./shopify-reconciliation-monitoring";
import { ADMIN_CLIENT_JS } from "./admin-client";

/** Envuelve un manejador async para que los errores devuelvan JSON legible. */
function handle(fn: (req: Request, res: Response) => Promise<unknown>) {
  return async (req: Request, res: Response) => {
    try {
      const result = await fn(req, res);
      if (!res.headersSent) res.json(result ?? { ok: true });
    } catch (error) {
      console.error("[admin]", error);
      if (!res.headersSent) {
        res.status(400).json({
          error: error instanceof Error ? error.message : "Ocurrió un error inesperado.",
        });
      }
    }
  };
}

export function registerAdminRoutes(app: Express): void {
  // El script del panel se sirve antes de exigir sesión porque el navegador lo
  // pide como recurso estático y ya está protegido por la cookie en las APIs.
  app.get("/admin/app.js", (_req, res) => {
    // Sin caché: el panel es una herramienta interna que cambia seguido, y una
    // copia guardada en el navegador hace que las mejoras publicadas no
    // aparezcan hasta que el usuario borre la caché a mano.
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.type("application/javascript").send(ADMIN_CLIENT_JS);
  });

  // --- Acceso al panel -----------------------------------------------------

  app.get("/admin/login", (req, res) => {
    if (isAuthenticated(req)) {
      res.redirect("/admin");
      return;
    }
    res.type("html").send(renderAdminPage("login", { configured: isAdminConfigured() }));
  });

  app.post("/admin/api/login", (req, res) => {
    const password = String(req.body?.password ?? "");

    if (!isAdminConfigured()) {
      res.status(500).json({ error: "El panel todavía no tiene contraseña configurada." });
      return;
    }

    if (!checkPassword(password)) {
      res.status(401).json({ error: "Contraseña incorrecta." });
      return;
    }

    startAdminSession(res);
    res.json({ ok: true });
  });

  app.post("/admin/api/logout", (_req, res) => {
    endAdminSession(res);
    res.json({ ok: true });
  });

  // --- Todo lo que sigue exige sesión --------------------------------------

  app.use("/admin", requireAdmin);

  app.get("/admin", (_req, res) => {
    res.type("html").send(renderAdminPage("app", {}));
  });

  // Resumen general
  app.get(
    "/admin/api/dashboard",
    handle(async () => {
      const { getCatalogState } = await import("./catalog");
      const state = await getCatalogState();
      return {
        catalog: { ...(await adminDashboard()), catalogVersion: state.catalogVersion },
        licenses: await licenseSummary(),
        emailProvider: isEmailProviderConfigured(),
      };
    }),
  );

  // --- Recetas -------------------------------------------------------------

  const bulkAction = (entity: BulkEntity) => handle(async (req) => {
    try { return await executeAdminBulk(entity, req.body, adminAuditActor(req)); }
    catch (error) {
      if (error instanceof BulkInputError) throw error;
      throw new Error("No se pudo confirmar el lote. Reintentá la misma operación para consultar su resultado.");
    }
  });
  app.post("/admin/api/recipes/bulk", bulkAction("recipes"));
  app.post("/admin/api/licenses/bulk-action", bulkAction("licenses"));
  app.get("/admin/api/bulk-operations", handle(async () => {
    try { return await listAdminBulkOperations(); }
    catch { throw new Error("No se pudo consultar el historial de operaciones."); }
  }));

  app.get(
    "/admin/api/recipes",
    handle(async (req) =>
      listRecipesForAdmin({
        search: req.query.search ? String(req.query.search) : undefined,
        status: req.query.status ? (String(req.query.status) as never) : undefined,
        collectionSlug: req.query.collection ? String(req.query.collection) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        offset: req.query.offset ? Number(req.query.offset) : undefined,
      }),
    ),
  );

  app.get(
    "/admin/api/recipes/:id",
    handle(async (req) => {
      const recipe = await getRecipeForEdit(Number(req.params.id));
      if (!recipe) throw new Error("No encontramos esta receta.");
      return recipe;
    }),
  );

  app.post(
    "/admin/api/recipes",
    handle(async (req) => ({ id: await createRecipe(req.body) })),
  );

  app.put(
    "/admin/api/recipes/:id",
    handle(async (req) => {
      await updateRecipe(Number(req.params.id), req.body);
      return { ok: true };
    }),
  );

  app.post(
    "/admin/api/recipes/:id/status",
    handle(async (req) => {
      await setRecipeStatus(Number(req.params.id), req.body?.status);
      return { ok: true };
    }),
  );

  app.post(
    "/admin/api/recipes/:id/duplicate",
    handle(async (req) => ({ id: await duplicateRecipe(Number(req.params.id)) })),
  );

  app.delete(
    "/admin/api/recipes/:id",
    handle(async (req) => {
      await deleteRecipe(Number(req.params.id));
      return { ok: true };
    }),
  );

  // --- Fotos de una receta --------------------------------------------------
  //
  // Todas devuelven la galería completa y ya ordenada. Es deliberado: así el
  // panel nunca tiene que recalcular posiciones ni deducir cuál quedó como
  // portada, que es donde aparecerían discrepancias entre lo que se ve en
  // pantalla y lo que la base tiene guardado.

  app.get(
    "/admin/api/recipes/:id/photos",
    handle(async (req) => {
      const recipeId = Number(req.params.id);
      // Una receta cargada antes de que existiera la galería todavía no tiene
      // filas: se crean al abrirla, de modo que la migración alcance también a lo
      // que se importe por CSV más adelante.
      await ensureCoverPhotoFromRecipe(recipeId);
      return { photos: await listRecipePhotos(recipeId) };
    }),
  );

  app.post(
    "/admin/api/recipes/:id/photos",
    handle(async (req) => ({
      photos: await addRecipePhoto(Number(req.params.id), {
        imageKey: String(req.body?.imageKey ?? ""),
        thumbKey: req.body?.thumbKey ?? null,
        altText: req.body?.altText ?? null,
        makeCover: req.body?.makeCover === true,
      }),
    })),
  );

  app.post(
    "/admin/api/recipes/:id/photos/:photoId/cover",
    handle(async (req) => ({
      photos: await setRecipeCover(Number(req.params.id), Number(req.params.photoId)),
    })),
  );

  app.post(
    "/admin/api/recipes/:id/photos/:photoId/replace",
    handle(async (req) => ({
      photos: await replaceRecipePhoto(Number(req.params.id), Number(req.params.photoId), {
        imageKey: String(req.body?.imageKey ?? ""),
        thumbKey: req.body?.thumbKey ?? null,
        altText: req.body?.altText ?? null,
      }),
    })),
  );

  app.post(
    "/admin/api/recipes/:id/photos/order",
    handle(async (req) => ({
      photos: await reorderRecipePhotos(
        Number(req.params.id),
        Array.isArray(req.body?.order) ? req.body.order.map(Number) : [],
      ),
    })),
  );

  app.delete(
    "/admin/api/recipes/:id/photos/:photoId",
    handle(async (req) => ({
      photos: await deleteRecipePhoto(Number(req.params.id), Number(req.params.photoId)),
    })),
  );

  // --- Colecciones y taxonomía ---------------------------------------------

  app.get("/admin/api/collections", handle(async () => listCollectionsForAdmin()));

  app.post(
    "/admin/api/collections",
    handle(async (req) => saveCollectionFromAdmin(req.body)),
  );

  app.delete(
    "/admin/api/collections/:id",
    handle(async (req) => {
      await deleteCollection(Number(req.params.id));
      return { ok: true };
    }),
  );

  app.get("/admin/api/taxonomy", handle(async () => listTaxonomyForAdmin()));

  app.post(
    "/admin/api/categories",
    handle(async (req) => ({ id: await upsertCategory(req.body) })),
  );

  app.post(
    "/admin/api/diet-tags",
    handle(async (req) => ({ id: await upsertDietTag(req.body) })),
  );

  // --- Importación y exportación -------------------------------------------

  app.get("/admin/api/csv/template", (_req, res) => {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="plantilla-recetas.csv"');
    // El BOM hace que Excel abra el archivo con los acentos correctos.
    res.send(`\uFEFF${CSV_TEMPLATE}`);
  });

  app.get("/admin/api/csv/export", async (_req, res) => {
    try {
      const csv = await exportCsv();
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="recetas.csv"');
      res.send(`\uFEFF${csv}`);
    } catch (error) {
      console.error("[admin] exportación:", error);
      res.status(500).send("No se pudo generar el archivo.");
    }
  });

  app.post(
    "/admin/api/csv/validate",
    handle(async (req) => {
      const content = String(req.body?.content ?? "");
      const report = await validateCsv(content);

      // Se devuelve un resumen liviano: las filas completas se vuelven a
      // validar al confirmar, para no depender del estado del navegador.
      return {
        total: report.total,
        validCount: report.valid.length,
        createCount: report.valid.filter((item) => item.action === "crear").length,
        updateCount: report.valid.filter((item) => item.action === "actualizar").length,
        preview: report.valid.slice(0, 20).map((item) => ({
          row: item.row,
          title: item.title,
          slug: item.slug,
          action: item.action,
        })),
        errors: report.errors,
        warnings: report.warnings,
      };
    }),
  );

  app.post(
    "/admin/api/csv/import",
    handle(async (req) => {
      const content = String(req.body?.content ?? "");
      const report = await validateCsv(content);

      if (report.errors.length > 0) {
        throw new Error("El archivo todavía tiene errores. Revisá el informe antes de importar.");
      }

      return applyImport(report.valid);
    }),
  );

  // --- Usuarios y accesos ---------------------------------------------------

  app.get(
    "/admin/api/users",
    handle(async (req) => {
      const archived = String(req.query.archived ?? "active");
      if (!["active", "archived", "all"].includes(archived)) throw new Error("Filtro de archivados inválido.");
      return listUsersWithLicenses(req.query.search ? String(req.query.search) : undefined, archived as "active" | "archived" | "all");
    }),
  );

  app.get(
    "/admin/api/licenses/:licenseId/devices",
    handle(async (req) => {
      const licenseId = Number(req.params.licenseId);
      if (!Number.isInteger(licenseId) || licenseId <= 0) {
        throw new Error("La licencia indicada no es válida.");
      }
      return listLicenseDevices(licenseId);
    }),
  );

  app.post(
    "/admin/api/licenses/:licenseId/devices/:deviceId/revoke",
    handle(async (req) => {
      const licenseId = Number(req.params.licenseId);
      const deviceId = Number(req.params.deviceId);
      if (
        !Number.isInteger(licenseId) ||
        licenseId <= 0 ||
        !Number.isInteger(deviceId) ||
        deviceId <= 0
      ) {
        throw new Error("El dispositivo indicado no es válido.");
      }

      const revoked = await revokeLicenseDevice(
        licenseId,
        deviceId,
        "panel",
        req.body?.reason
          ? String(req.body.reason).slice(0, 240)
          : "Revocado manualmente desde /admin",
      );
      if (!revoked)
        throw new Error("No encontramos ese dispositivo para esta licencia.");
      return { ok: true };
    }),
  );

  app.post(
    "/admin/api/licenses/:licenseId/devices/:deviceId/reactivate",
    handle(async (req) => {
      const licenseId = Number(req.params.licenseId);
      const deviceId = Number(req.params.deviceId);
      if (
        !Number.isInteger(licenseId) ||
        licenseId <= 0 ||
        !Number.isInteger(deviceId) ||
        deviceId <= 0
      ) {
        throw new Error("El dispositivo indicado no es válido.");
      }

      const reactivated = await reactivateLicenseDevice(licenseId, deviceId);
      if (!reactivated)
        throw new Error("No encontramos ese dispositivo para esta licencia.");
      return { ok: true };
    }),
  );

  app.get("/admin/api/codes", handle(async () => listPendingCodes()));

  // --- Fotos del catálogo ---------------------------------------------------

  app.post(
    "/admin/api/images",
    handle(async (req) =>
      uploadCatalogImage(
        String(req.body?.content ?? ""),
        String(req.body?.fileName ?? "foto.jpg"),
      ),
    ),
  );

  app.post(
    "/admin/api/licenses",
    handle(async (req) => {
      const license = await grantLicense({
        email: String(req.body?.email ?? ""),
        source: "manual",
        notes: req.body?.notes ?? null,
        actorEmail: "panel",
      });
      return { id: license.id };
    }),
  );

  app.post(
    "/admin/api/licenses/status",
    handle(async (req) => {
      await setLicenseStatus(
        String(req.body?.email ?? ""),
        req.body?.status,
        "panel",
        req.body?.reason ?? null,
      );
      return { ok: true };
    }),
  );

  /**
   * Alta masiva de licencias desde una lista pegada a mano.
   *
   * Sólo accesible con sesión de administrador, igual que el resto de este
   * bloque: el flujo público de acceso no cambia y nadie obtiene licencia sin
   * que se la otorguen explícitamente desde acá.
   */
  app.post(
    "/admin/api/licenses/bulk",
    handle(async (req) =>
      bulkGrantLicenses({
        raw: String(req.body?.emails ?? ""),
        label: req.body?.label ?? null,
        actorEmail: "panel",
      }),
    ),
  );

  app.post(
    "/admin/api/shopify/delivery-email/retry",
    handle(async (req) => {
      const orderId = String(req.body?.orderId ?? "").trim();
      if (!/^\d+$/.test(orderId)) throw new Error("ID de pedido inválido.");
      return { result: await retryShopifyDeliveryEmail(orderId) };
    }),
  );

  // --- Reconciliación Shopify -----------------------------------------------
  // Estas rutas están después de `requireAdmin`: nunca quedan expuestas al
  // flujo público y reutilizan el mismo servicio que el webhook y el cron.

  app.get(
    "/admin/api/shopify/reconciliation/status",
    handle(async () => {
      const reconciliation = await getShopifyReconciliationStatus();
      const monitoring = await getShopifyReconciliationMonitoringStatus();
      return { ...reconciliation, monitoring };
    }),
  );

  app.post(
    "/admin/api/shopify/reconciliation/monitoring/simulate-error",
    handle(async () => ({ run: await simulateAutomaticReconciliationFailure() })),
  );

  app.post(
    "/admin/api/shopify/reconciliation/recent",
    handle(async () => reconcileRecentShopifyOrders("manual_recent")),
  );

  app.post(
    "/admin/api/shopify/reconciliation/order",
    handle(async (req) => reconcileShopifyOrder(String(req.body?.identifier ?? ""))),
  );
}

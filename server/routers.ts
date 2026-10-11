import { z } from "zod";

import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import {
  checkAccessStatus,
  requestAccessCode,
  revokeSession,
  verifyAccessCode,
} from "./access";
import { getCatalogState, pullCatalogChanges } from "./catalog";

/**
 * Rutas de la API consumidas por la aplicación móvil.
 *
 * El acceso de la aplicación usa un token propio enviado en el argumento de
 * cada llamada, no la cookie de sesión del navegador: en un dispositivo móvil no
 * hay cookies compartidas y el token vive en el almacenamiento seguro.
 */

const emailSchema = z
  .string()
  .trim()
  .min(5, "Ingresá un correo válido")
  .max(320)
  .email("Ingresá un correo válido");

const deviceFields = {
  deviceId: z.string().trim().min(16).max(128).optional(),
  deviceLabel: z.string().trim().max(160).optional(),
  platform: z.string().trim().max(32).optional(),
  appVersion: z.string().trim().max(32).optional(),
  manufacturer: z.string().trim().max(120).optional(),
  modelName: z.string().trim().max(160).optional(),
  modelId: z.string().trim().max(120).optional(),
  osVersion: z.string().trim().max(64).optional(),
};

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  /** Acceso de compradores mediante correo y código de un solo uso. */
  access: router({
    requestCode: publicProcedure
      .input(z.object({ email: emailSchema }))
      .mutation(async ({ input, ctx }) => {
        const ip =
          (ctx.req.headers["x-forwarded-for"] as string | undefined)
            ?.split(",")[0]
            ?.trim() ??
          ctx.req.socket?.remoteAddress ??
          undefined;
        return requestAccessCode(input.email, ip);
      }),

    verifyCode: publicProcedure
      .input(
        z.object({
          email: emailSchema,
          code: z.string().trim().min(4).max(8),
          ...deviceFields,
        }),
      )
      .mutation(async ({ input }) => {
        const outcome = await verifyAccessCode(input.email, input.code, {
          deviceId: input.deviceId ?? "",
          label: input.deviceLabel,
          platform: input.platform,
          appVersion: input.appVersion,
                manufacturer: input.manufacturer, modelName: input.modelName, modelId: input.modelId, osVersion: input.osVersion,
        });
        return { ...outcome.result, reason: outcome.reason ?? null };
      }),

    status: publicProcedure
      .input(z.object({ token: z.string().min(16), ...deviceFields }))
      .query(async ({ input }) =>
        checkAccessStatus(
          input.token,
          input.deviceId
            ? {
                deviceId: input.deviceId,
                label: input.deviceLabel,
                platform: input.platform,
                appVersion: input.appVersion,
                manufacturer: input.manufacturer, modelName: input.modelName, modelId: input.modelId, osVersion: input.osVersion,
              }
            : undefined,
        ),
      ),

    signOut: publicProcedure
      .input(z.object({ token: z.string().min(16), deviceId: deviceFields.deviceId }))
      .mutation(async ({ input }) => {
        await revokeSession(input.token, input.deviceId);
        return { success: true } as const;
      }),
  }),

  /** Sincronización del catálogo. */
  sync: router({
    /**
     * Estado ligero del catálogo.
     *
     * Es deliberadamente público: no revela contenido, sólo un número de versión
     * y un recuento, y permite que la pantalla de acceso muestre cuántas recetas
     * hay disponibles sin exigir credenciales.
     */
    state: publicProcedure.query(async () => getCatalogState()),

    /**
     * Cambios del catálogo posteriores a `since`.
     *
     * Exige un token con licencia activa: el contenido es el producto vendido.
     */
    pull: publicProcedure
      .input(
        z.object({
          token: z.string().min(16),
          since: z.string().datetime().nullable().optional(),
          recipeFormatVersion: z.union([z.literal(1), z.literal(2)]).optional(),
          ...deviceFields,
        }),
      )
      .query(async ({ input }) => {
        const access = await checkAccessStatus(
          input.token,
          input.deviceId
            ? {
                deviceId: input.deviceId,
                label: input.deviceLabel,
                platform: input.platform,
                appVersion: input.appVersion,
                manufacturer: input.manufacturer, modelName: input.modelName, modelId: input.modelId, osVersion: input.osVersion,
              }
            : undefined,
        );
        if (!access.authorized) {
          return {
            authorized: false as const,
            status: access.status,
            reason: access.reason ?? null,
            data: null,
          };
        }

        const since = input.since ? new Date(input.since) : null;
        const data = await pullCatalogChanges(
          since && Number.isFinite(since.getTime()) ? since : null,
          input.recipeFormatVersion ?? 1,
        );
        return { authorized: true as const, status: access.status, data };
      }),
  }),
});

export type AppRouter = typeof appRouter;

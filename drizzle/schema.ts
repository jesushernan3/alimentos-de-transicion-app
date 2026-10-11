import {
  boolean,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Esquema de Alimentos de Transición.
 *
 * Se organiza en tres bloques con responsabilidades separadas:
 *
 * 1. IDENTIDAD Y ACCESO — usuarios, códigos de un solo uso, sesiones y
 *    licencias. La autenticación (quién es) está deliberadamente separada de la
 *    autorización (a qué tiene derecho), porque una persona puede tener cuenta
 *    sin haber comprado.
 * 2. CATÁLOGO EDITORIAL — recetas, ingredientes, pasos, colecciones,
 *    categorías y atributos. Es la fuente de verdad del contenido y se
 *    administra desde el panel, sin recompilar la aplicación.
 * 3. SINCRONIZACIÓN — versión global del catálogo y registro de bajas, que son
 *    los dos datos que permiten enviar sólo lo que cambió.
 *
 * Convención de columnas: camelCase, para que coincidan los nombres de la base
 * de datos y los tipos generados.
 */

/* ------------------------------------------------------------------ */
/* 1. IDENTIDAD Y ACCESO                                              */
/* ------------------------------------------------------------------ */

/**
 * Usuario de la plataforma.
 *
 * `openId` se conserva porque el framework de autenticación del proyecto lo
 * utiliza para el panel administrativo. Los compradores que entran con correo y
 * código reciben un `openId` sintético con prefijo `email:`, de modo que ambos
 * mecanismos conviven sobre la misma tabla sin ramas especiales.
 */
export const users = mysqlTable(
  "users",
  {
    id: int("id").autoincrement().primaryKey(),
    openId: varchar("openId", { length: 64 }).notNull().unique(),
    name: text("name"),
    email: varchar("email", { length: 320 }),
    loginMethod: varchar("loginMethod", { length: 64 }),
    role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  },
  (table) => ({
    emailIdx: index("users_email_idx").on(table.email),
  }),
);

/**
 * Código de acceso de un solo uso.
 *
 * Se guarda el hash del código, no el código en claro, para que una filtración
 * de la base no permita iniciar sesión. `deliveredTo` registra el canal usado y
 * `debugCode` sólo se rellena mientras no haya proveedor de correo configurado,
 * de modo que el administrador pueda asistir a un comprador durante las pruebas.
 */
export const accessCodes = mysqlTable(
  "accessCodes",
  {
    id: int("id").autoincrement().primaryKey(),
    email: varchar("email", { length: 320 }).notNull(),
    codeHash: varchar("codeHash", { length: 128 }).notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    consumedAt: timestamp("consumedAt"),
    attempts: int("attempts").default(0).notNull(),
    deliveredVia: mysqlEnum("deliveredVia", ["pending", "email", "manual"])
      .default("pending")
      .notNull(),
    debugCode: varchar("debugCode", { length: 12 }),
    requestIp: varchar("requestIp", { length: 64 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    emailIdx: index("accessCodes_email_idx").on(table.email),
  }),
);

/**
 * Sesión de larga duración asociada a un dispositivo.
 *
 * Existe una fila por dispositivo para poder revocar accesos de forma
 * individual en el futuro sin expulsar al usuario de todos sus teléfonos.
 */
export const sessions = mysqlTable(
  "sessions",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    tokenHash: varchar("tokenHash", { length: 128 }).notNull().unique(),
    deviceLabel: varchar("deviceLabel", { length: 160 }),
    platform: varchar("platform", { length: 32 }),
    licenseDeviceId: int("licenseDeviceId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
    revokedAt: timestamp("revokedAt"),
  },
  (table) => ({
    userIdx: index("sessions_userId_idx").on(table.userId),
    deviceIdx: index("sessions_licenseDeviceId_idx").on(table.licenseDeviceId),
  }),
);

/**
 * Licencia de acceso al producto.
 *
 * `source` anticipa el origen `shopify` de la próxima fase y `externalOrderId`
 * guarda el número de pedido, de modo que el webhook sólo tenga que insertar o
 * actualizar filas. `expiresAt` nulo significa acceso permanente, que es el
 * caso del pago único.
 */
export const licenses = mysqlTable(
  "licenses",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId"),
    email: varchar("email", { length: 320 }).notNull(),
    productId: varchar("productId", { length: 96 }).default("alimentos-de-transicion").notNull(),
    source: mysqlEnum("source", ["manual", "shopify", "import", "gift"])
      .default("manual")
      .notNull(),
    externalOrderId: varchar("externalOrderId", { length: 128 }),
    status: mysqlEnum("status", ["active", "pending", "revoked", "refunded"])
      .default("active")
      .notNull(),
    notes: text("notes"),
    activatedAt: timestamp("activatedAt"),
    /** Primera autenticación exitosa real; nunca se sobrescribe. */
    firstLoginAt: timestamp("firstLoginAt"),
    /** Autenticación exitosa real más reciente; no incluye restauraciones de sesión. */
    lastLoginAt: timestamp("lastLoginAt"),
    /**
     * Desde cuándo esta licencia puede clasificarse con certeza como pendiente.
     * Nulo en licencias históricas sin evidencia suficiente, que el panel muestra
     * como «Sin datos» hasta que ocurra un login real.
     */
    accessTrackingStartedAt: timestamp("accessTrackingStartedAt"),
    expiresAt: timestamp("expiresAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    emailProductUnique: uniqueIndex("licenses_email_product_unique").on(table.email, table.productId),
    emailIdx: index("licenses_email_idx").on(table.email),
    statusIdx: index("licenses_status_idx").on(table.status),
  }),
);

/**
 * Instalación autorizada para una licencia.
 *
 * `deviceId` es un UUID aleatorio generado por la aplicación y guardado en el
 * almacenamiento seguro. No representa ni deriva de un identificador físico.
 * La revocación es lógica para conservar historial y permitir soporte.
 */
export const licenseDevices = mysqlTable(
  "licenseDevices",
  {
    id: int("id").autoincrement().primaryKey(),
    licenseId: int("licenseId").notNull(),
    email: varchar("email", { length: 320 }).notNull(),
    deviceId: varchar("deviceId", { length: 128 }).notNull(),
    deviceLabel: varchar("deviceLabel", { length: 160 }),
    platform: varchar("platform", { length: 32 }),
    appVersion: varchar("appVersion", { length: 32 }),
    manufacturer: varchar("manufacturer", { length: 120 }),
    modelName: varchar("modelName", { length: 160 }),
    modelId: varchar("modelId", { length: 120 }),
    osVersion: varchar("osVersion", { length: 64 }),
    registeredAt: timestamp("registeredAt").defaultNow().notNull(),
    lastActivityAt: timestamp("lastActivityAt").defaultNow().notNull(),
    /** Baja voluntaria: no ocupa cupo y admite volver sólo con OTP nuevo. */
    releasedAt: timestamp("releasedAt"),
    revokedAt: timestamp("revokedAt"),
    revokedBy: varchar("revokedBy", { length: 320 }),
    revokeReason: varchar("revokeReason", { length: 240 }),
  },
  (table) => ({
    licenseIdx: index("licenseDevices_licenseId_idx").on(table.licenseId),
    activeIdx: index("licenseDevices_active_idx").on(
      table.licenseId,
      table.revokedAt,
    ),
    uniqueLicenseDevice: uniqueIndex("licenseDevices_license_device_unique").on(
      table.licenseId,
      table.deviceId,
    ),
  }),
);

/** Auditoría de cambios de acceso: quién los hizo, cuándo y por qué. */
export const licenseEvents = mysqlTable(
  "licenseEvents",
  {
    id: int("id").autoincrement().primaryKey(),
    licenseId: int("licenseId"),
    email: varchar("email", { length: 320 }).notNull(),
    action: mysqlEnum("action", [
      "granted",
      "revoked",
      "reactivated",
      "refunded",
      "imported",
      "shopify_paid",
      "shopify_refunded",
    ]).notNull(),
    actorEmail: varchar("actorEmail", { length: 320 }),
    detail: text("detail"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    licenseIdx: index("licenseEvents_licenseId_idx").on(table.licenseId),
  }),
);

/**
 * Entregas `orders/paid` procesadas desde Shopify.
 *
 * La licencia sigue siendo la fuente de verdad del acceso. Esta tabla sólo
 * conserva la auditoría externa y garantiza que un pedido no se procese dos
 * veces. El pedido y el identificador de entrega son únicos por separado.
 */
export const shopifyWebhookEvents = mysqlTable(
  "shopifyWebhookEvents",
  {
    id: int("id").autoincrement().primaryKey(),
    webhookId: varchar("webhookId", { length: 128 }),
    shopifyOrderId: varchar("shopifyOrderId", { length: 128 }).notNull(),
    shopDomain: varchar("shopDomain", { length: 255 }),
    topic: varchar("topic", { length: 64 }).default("orders/paid").notNull(),
    email: varchar("email", { length: 320 }),
    productId: varchar("productId", { length: 96 }),
    variantId: varchar("variantId", { length: 96 }),
    financialStatus: varchar("financialStatus", { length: 48 }),
    result: mysqlEnum("result", [
      "processing",
      "license_created",
      "license_reactivated",
      "license_existing",
      "ignored_product",
      "ignored_status",
      "invalid_email",
      "internal_error",
    ]).notNull(),
    detail: text("detail"),
    payloadHash: varchar("payloadHash", { length: 64 }).notNull(),
    deliveryEmailStatus: mysqlEnum("deliveryEmailStatus", [
      "not_applicable",
      "pending",
      "sending",
      "sent",
      "failed",
    ])
      .default("not_applicable")
      .notNull(),
    deliveryEmailAttempts: int("deliveryEmailAttempts").default(0).notNull(),
    deliveryEmailLastAttemptAt: timestamp("deliveryEmailLastAttemptAt"),
    deliveryEmailSentAt: timestamp("deliveryEmailSentAt"),
    deliveryEmailProviderId: varchar("deliveryEmailProviderId", { length: 128 }),
    deliveryEmailError: text("deliveryEmailError"),
    processedAt: timestamp("processedAt").defaultNow().notNull(),
  },
  (table) => ({
    orderUnique: uniqueIndex("shopifyWebhookEvents_order_unique").on(table.shopifyOrderId),
    webhookUnique: uniqueIndex("shopifyWebhookEvents_webhook_unique").on(table.webhookId),
    emailIdx: index("shopifyWebhookEvents_email_idx").on(table.email),
    resultIdx: index("shopifyWebhookEvents_result_idx").on(table.result),
  }),
);

/**
 * Respaldo diagnóstico temporal de los primeros días de producción.
 *
 * Se mantiene en el esquema para evitar que una migración futura proponga
 * eliminarla, pero el runtime no la importa ni realiza nuevas escrituras.
 */
export const shopifyWebhookAttempts = mysqlTable(
  "shopifyWebhookAttempts",
  {
    id: int("id").autoincrement().primaryKey(),
    webhookId: varchar("webhookId", { length: 128 }),
    shopDomain: varchar("shopDomain", { length: 255 }),
    topic: varchar("topic", { length: 64 }),
    hmacStatus: mysqlEnum("hmacStatus", [
      "unchecked",
      "valid",
      "invalid",
      "missing",
      "config_missing",
    ])
      .default("unchecked")
      .notNull(),
    httpStatus: int("httpStatus"),
    contentLength: int("contentLength").default(0).notNull(),
    receivedAt: timestamp("receivedAt").defaultNow().notNull(),
    completedAt: timestamp("completedAt"),
  },
  (table) => ({
    webhookIdx: index("shopifyWebhookAttempts_webhook_idx").on(table.webhookId),
    receivedIdx: index("shopifyWebhookAttempts_received_idx").on(table.receivedAt),
    hmacIdx: index("shopifyWebhookAttempts_hmac_idx").on(table.hmacStatus),
  }),
);

/**
 * Estado singleton de la reconciliación Shopify.
 *
 * Conserva el UID del cron, evita dos ejecuciones simultáneas y permite que el
 * backoffice muestre el resultado de la última corrida sin crear otra fuente
 * de verdad para pedidos o licencias.
 */
export const shopifyReconciliationState = mysqlTable("shopifyReconciliationState", {
  id: int("id").primaryKey(),
  scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 128 }),
  runningSince: timestamp("runningSince"),
  lastStartedAt: timestamp("lastStartedAt"),
  lastCompletedAt: timestamp("lastCompletedAt"),
  lastStatus: mysqlEnum("lastStatus", ["never", "success", "partial", "failed"])
    .default("never")
    .notNull(),
  lastMode: mysqlEnum("lastMode", ["automatic", "manual_recent", "manual_order"]),
  lastScanned: int("lastScanned").default(0).notNull(),
  lastProcessed: int("lastProcessed").default(0).notNull(),
  lastDuplicates: int("lastDuplicates").default(0).notNull(),
  lastErrors: int("lastErrors").default(0).notNull(),
  lastDetail: text("lastDetail"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/**
 * Historial operativo de cada invocación automática del cron.
 *
 * No es fuente de verdad de pedidos ni licencias: registra únicamente salud,
 * métricas agregadas y estado de las alertas administrativas.
 */
export const shopifyReconciliationRuns = mysqlTable(
  "shopifyReconciliationRuns",
  {
    id: int("id").autoincrement().primaryKey(),
    runUid: varchar("runUid", { length: 64 }).notNull(),
    trigger: mysqlEnum("trigger", ["cron", "simulation"]).notNull(),
    status: mysqlEnum("status", ["running", "success", "error", "skipped"])
      .default("running")
      .notNull(),
    result: varchar("result", { length: 64 }).notNull(),
    startedAt: timestamp("startedAt").notNull(),
    completedAt: timestamp("completedAt"),
    durationMs: int("durationMs"),
    scanned: int("scanned").default(0).notNull(),
    processed: int("processed").default(0).notNull(),
    duplicates: int("duplicates").default(0).notNull(),
    errors: int("errors").default(0).notNull(),
    technicalMessage: text("technicalMessage"),
    errorFingerprint: varchar("errorFingerprint", { length: 64 }),
    alertStatus: mysqlEnum("alertStatus", [
      "not_required",
      "pending",
      "sent",
      "suppressed",
      "failed",
      "not_configured",
    ])
      .default("not_required")
      .notNull(),
    alertSentAt: timestamp("alertSentAt"),
    alertProviderId: varchar("alertProviderId", { length: 128 }),
    alertError: text("alertError"),
    recoveryAlertStatus: mysqlEnum("recoveryAlertStatus", [
      "not_required",
      "pending",
      "sent",
      "failed",
      "not_configured",
    ])
      .default("not_required")
      .notNull(),
    recoveryAlertSentAt: timestamp("recoveryAlertSentAt"),
    recoveryAlertProviderId: varchar("recoveryAlertProviderId", { length: 128 }),
    recoveryAlertError: text("recoveryAlertError"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    runUidUnique: uniqueIndex("shopifyReconciliationRuns_runUid_unique").on(table.runUid),
    startedIdx: index("shopifyReconciliationRuns_startedAt_idx").on(table.startedAt),
    statusIdx: index("shopifyReconciliationRuns_status_idx").on(table.status),
    fingerprintIdx: index("shopifyReconciliationRuns_fingerprint_idx").on(
      table.errorFingerprint,
    ),
  }),
);

/* ------------------------------------------------------------------ */
/* 2. CATÁLOGO EDITORIAL                                              */
/* ------------------------------------------------------------------ */

/**
 * Maestro de ingredientes reutilizable.
 *
 * `pantryCategory` es el sector del supermercado y es lo que permite agrupar la
 * lista de compras sin heurísticas basadas en el nombre.
 */
export const ingredients = mysqlTable(
  "ingredients",
  {
    id: int("id").autoincrement().primaryKey(),
    slug: varchar("slug", { length: 120 }).notNull().unique(),
    name: varchar("name", { length: 160 }).notNull(),
    pantryCategory: varchar("pantryCategory", { length: 48 }).notNull(),
    defaultUnit: varchar("defaultUnit", { length: 24 }).notNull(),
    version: int("version").default(1).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    updatedIdx: index("ingredients_updatedAt_idx").on(table.updatedAt),
  }),
);

/** Categoría gastronómica: desayunos, almuerzos, cenas y demás. */
export const categories = mysqlTable(
  "categories",
  {
    id: int("id").autoincrement().primaryKey(),
    slug: varchar("slug", { length: 120 }).notNull().unique(),
    name: varchar("name", { length: 160 }).notNull(),
    description: text("description"),
    imageKey: varchar("imageKey", { length: 320 }),
    icon: varchar("icon", { length: 64 }),
    sortOrder: int("sortOrder").default(0).notNull(),
    published: boolean("published").default(true).notNull(),
    version: int("version").default(1).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    updatedIdx: index("categories_updatedAt_idx").on(table.updatedAt),
  }),
);

/**
 * Atributo dietario: sin TACC, vegana, alta en proteína y demás.
 *
 * Se mantiene como tabla propia y no como valores de `categories` porque son
 * ejes distintos: una receta tiene una categoría y varios atributos.
 */
export const dietTags = mysqlTable(
  "dietTags",
  {
    id: int("id").autoincrement().primaryKey(),
    slug: varchar("slug", { length: 120 }).notNull().unique(),
    name: varchar("name", { length: 160 }).notNull(),
    description: text("description"),
    sortOrder: int("sortOrder").default(0).notNull(),
    published: boolean("published").default(true).notNull(),
    version: int("version").default(1).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    updatedIdx: index("dietTags_updatedAt_idx").on(table.updatedAt),
  }),
);

/** Colección editorial, por ejemplo "Recetario Sin T.A.C.C.". */
export const collections = mysqlTable(
  "collections",
  {
    id: int("id").autoincrement().primaryKey(),
    slug: varchar("slug", { length: 120 }).notNull().unique(),
    name: varchar("name", { length: 180 }).notNull(),
    tagline: varchar("tagline", { length: 240 }),
    description: text("description"),
    imageKey: varchar("imageKey", { length: 320 }),
    accentColor: varchar("accentColor", { length: 16 }),
    sortOrder: int("sortOrder").default(0).notNull(),
    published: boolean("published").default(true).notNull(),
    version: int("version").default(1).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    updatedIdx: index("collections_updatedAt_idx").on(table.updatedAt),
  }),
);

/** Registro antes del PUT: ninguna portada subida queda sin clave recuperable. */
export const collectionCoverUploads = mysqlTable("collectionCoverUploads", {
  operationId: varchar("operationId", { length: 36 }).primaryKey(),
  imageKey: varchar("imageKey", { length: 320 }).notNull().unique(),
  requestHash: varchar("requestHash", { length: 64 }).notNull(),
  collectionId: int("collectionId"),
  status: mysqlEnum("status", ["reserved", "uploaded", "attached"]).default("reserved").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/**
 * Receta.
 *
 * `version` se incrementa en cada guardado y `updatedAt` es la marca que usa la
 * sincronización incremental. `status` distingue borrador, publicada y
 * archivada: sólo las publicadas llegan a la aplicación.
 */
export const recipes = mysqlTable(
  "recipes",
  {
    id: int("id").autoincrement().primaryKey(),
    slug: varchar("slug", { length: 160 }).notNull().unique(),
    title: varchar("title", { length: 240 }).notNull(),
    shortDescription: varchar("shortDescription", { length: 400 }),
    description: text("description"),
    imageKey: varchar("imageKey", { length: 320 }),
    thumbKey: varchar("thumbKey", { length: 320 }),
    gallery: json("gallery"),
    categoryId: int("categoryId"),
    prepTime: int("prepTime").default(0).notNull(),
    cookingTime: int("cookingTime").default(0).notNull(),
    totalTime: int("totalTime").default(0).notNull(),
    difficulty: mysqlEnum("difficulty", ["facil", "intermedia", "avanzada"])
      .default("facil")
      .notNull(),
    portions: int("portions").default(2).notNull(),
    nutrition: json("nutrition"),
    tips: text("tips"),
    /** Consejos adicionales, separados de `tips` para no romper clientes antiguos. */
    extraTips: text("extraTips"),
    notes: text("notes"),
    featured: boolean("featured").default(false).notNull(),
    communitySaves: int("communitySaves").default(0).notNull(),
    status: mysqlEnum("status", ["draft", "published", "archived"])
      .default("draft")
      .notNull(),
    version: int("version").default(1).notNull(),
    publishedAt: timestamp("publishedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    statusIdx: index("recipes_status_idx").on(table.status),
    updatedIdx: index("recipes_updatedAt_idx").on(table.updatedAt),
    categoryIdx: index("recipes_categoryId_idx").on(table.categoryId),
  }),
);

/**
 * Fotos de una receta, hasta ocho.
 *
 * Las columnas `imageKey` y `thumbKey` de `recipes` se conservan como espejo de
 * la portada: son lo que lee la versión de la aplicación ya publicada, que no
 * conoce esta tabla. Esa duplicación es deliberada y debe mantenerse mientras
 * queden teléfonos con la versión anterior instalada.
 *
 * El límite de ocho vive en la validación del servidor y no en el esquema, de
 * modo que cambiarlo no obligue a migrar la base.
 */
export const recipePhotos = mysqlTable(
  "recipe_photos",
  {
    id: int("id").autoincrement().primaryKey(),
    recipeId: int("recipeId").notNull(),
    /** Variante de 1200 px de ancho, en WebP. */
    imageKey: varchar("imageKey", { length: 320 }).notNull(),
    /** Variante de 480 px. Puede faltar si la foto se cargó por dirección externa. */
    thumbKey: varchar("thumbKey", { length: 320 }),
    /** Texto alternativo para lectores de pantalla. */
    altText: varchar("altText", { length: 240 }),
    sortOrder: int("sortOrder").default(0).notNull(),
    /** Portada. Sólo una por receta; lo garantiza el índice único parcial. */
    isCover: boolean("isCover").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    recipeIdx: index("recipe_photos_recipeId_idx").on(table.recipeId, table.sortOrder),
    /**
     * Impide cargar dos veces la misma foto en una receta. Sin esto, una doble
     * pulsación en el panel dejaría duplicados que habría que limpiar a mano.
     */
    uniquePhoto: uniqueIndex("recipe_photos_recipe_image_unique").on(
      table.recipeId,
      table.imageKey,
    ),
  }),
);

/*
 * Portada única por receta.
 *
 * La base tiene además una columna generada `coverGuard` y un índice único sobre
 * ella, creados en la migración 0002. Vale `recipeId` cuando la foto es portada y
 * NULL en el resto; como los índices únicos ignoran los nulos, el resultado es un
 * índice único parcial, que MySQL no admite de forma directa.
 *
 * No se declara en Drizzle porque las columnas generadas no forman parte del
 * modelo que se escribe: es una restricción de integridad, no un dato. Si alguna
 * vez se regenera el esquema desde cero, hay que volver a aplicar ese tramo de la
 * migración a mano.
 */

/**
 * Ingrediente de una receta con cantidad y unidad estructuradas.
 *
 * Nunca se almacena la línea como texto libre: es lo que hace posible escalar
 * porciones, consolidar la lista de compras y buscar por ingrediente.
 */
export const recipeIngredients = mysqlTable(
  "recipeIngredients",
  {
    id: int("id").autoincrement().primaryKey(),
    recipeId: int("recipeId").notNull(),
    /** Nulo en encabezados de grupo, que no apuntan a un ingrediente maestro. */
    ingredientId: int("ingredientId"),
    type: mysqlEnum("type", ["ingredient", "group"]).default("ingredient").notNull(),
    groupTitle: varchar("groupTitle", { length: 240 }),
    quantity: varchar("quantity", { length: 24 }),
    unit: varchar("unit", { length: 24 }),
    note: varchar("note", { length: 240 }),
    sortOrder: int("sortOrder").default(0).notNull(),
  },
  (table) => ({
    recipeIdx: index("recipeIngredients_recipeId_idx").on(table.recipeId),
  }),
);

/** Paso de preparación, numerado y reordenable. */
export const recipeSteps = mysqlTable(
  "recipeSteps",
  {
    id: int("id").autoincrement().primaryKey(),
    recipeId: int("recipeId").notNull(),
    type: mysqlEnum("type", ["step", "group"]).default("step").notNull(),
    groupTitle: varchar("groupTitle", { length: 240 }),
    stepNumber: int("stepNumber").notNull(),
    description: text("description").notNull(),
    durationMinutes: int("durationMinutes"),
    /** Orden editorial; filas históricas usan `stepNumber` como fallback. */
    sortOrder: int("sortOrder"),
  },
  (table) => ({
    recipeIdx: index("recipeSteps_recipeId_idx").on(table.recipeId),
  }),
);

/** Pertenencia de una receta a una colección. */
export const recipeCollections = mysqlTable(
  "recipeCollections",
  {
    id: int("id").autoincrement().primaryKey(),
    recipeId: int("recipeId").notNull(),
    collectionId: int("collectionId").notNull(),
    sortOrder: int("sortOrder").default(0).notNull(),
  },
  (table) => ({
    pairIdx: uniqueIndex("recipeCollections_pair_idx").on(table.recipeId, table.collectionId),
    collectionIdx: index("recipeCollections_collectionId_idx").on(table.collectionId),
  }),
);

/** Atributo dietario de una receta. */
export const recipeDietTags = mysqlTable(
  "recipeDietTags",
  {
    id: int("id").autoincrement().primaryKey(),
    recipeId: int("recipeId").notNull(),
    dietTagId: int("dietTagId").notNull(),
  },
  (table) => ({
    pairIdx: uniqueIndex("recipeDietTags_pair_idx").on(table.recipeId, table.dietTagId),
  }),
);

/* ------------------------------------------------------------------ */
/* 3. SINCRONIZACIÓN                                                  */
/* ------------------------------------------------------------------ */

/**
 * Estado global del catálogo.
 *
 * Una sola fila con `id = 1`. `catalogVersion` se incrementa con cada cambio
 * publicado, lo que permite a la aplicación detectar novedades con una consulta
 * mínima antes de decidir si vale la pena pedir el detalle.
 */
export const catalogState = mysqlTable("catalogState", {
  id: int("id").primaryKey(),
  catalogVersion: int("catalogVersion").default(1).notNull(),
  publishedRecipes: int("publishedRecipes").default(0).notNull(),
  lastChangeAt: timestamp("lastChangeAt").defaultNow().notNull(),
});

/**
 * Registro de bajas.
 *
 * Cuando una receta se elimina o se despublica hay que informarlo, porque la
 * ausencia de un registro en la respuesta incremental no basta para que el
 * cliente sepa que debe borrarlo de su base local.
 */
export const deletions = mysqlTable(
  "deletions",
  {
    id: int("id").autoincrement().primaryKey(),
    entity: mysqlEnum("entity", [
      "recipe",
      "collection",
      "category",
      "dietTag",
      "ingredient",
    ]).notNull(),
    entityId: int("entityId").notNull(),
    slug: varchar("slug", { length: 160 }),
    deletedAt: timestamp("deletedAt").defaultNow().notNull(),
  },
  (table) => ({
    deletedIdx: index("deletions_deletedAt_idx").on(table.deletedAt),
  }),
);

/* ------------------------------------------------------------------ */
/* Tipos exportados                                                   */
/* ------------------------------------------------------------------ */

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type AccessCode = typeof accessCodes.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type License = typeof licenses.$inferSelect;
export type InsertLicense = typeof licenses.$inferInsert;
export type LicenseDevice = typeof licenseDevices.$inferSelect;
export type LicenseEvent = typeof licenseEvents.$inferSelect;
export type IngredientRow = typeof ingredients.$inferSelect;
export type InsertIngredientRow = typeof ingredients.$inferInsert;
export type CategoryRow = typeof categories.$inferSelect;
export type DietTagRow = typeof dietTags.$inferSelect;
export type CollectionRow = typeof collections.$inferSelect;
export type InsertCollectionRow = typeof collections.$inferInsert;
export type RecipeRow = typeof recipes.$inferSelect;
export type InsertRecipeRow = typeof recipes.$inferInsert;
export type RecipeIngredientRow = typeof recipeIngredients.$inferSelect;
export type RecipeStepRow = typeof recipeSteps.$inferSelect;
export type CatalogStateRow = typeof catalogState.$inferSelect;
export type DeletionRow = typeof deletions.$inferSelect;

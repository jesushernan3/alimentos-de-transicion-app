/**
 * Esquema de la base de datos local del dispositivo.
 *
 * Se define como una lista de migraciones ordenadas: cada entrada agrupa las
 * sentencias que llevan la base de la versión anterior a la siguiente. La
 * aplicación consulta `PRAGMA user_version` al abrir y ejecuta únicamente las
 * migraciones pendientes, de modo que actualizar la app nunca obliga a borrar
 * el contenido ya descargado.
 *
 * El identificador de cada entidad es su `slug`: es estable entre entornos y
 * sobrevive a cualquier reconstrucción de la base del servidor.
 */

export interface LocalMigration {
  version: number;
  description: string;
  statements: string[];
}

export const LOCAL_MIGRATIONS: LocalMigration[] = [
  {
    version: 1,
    description: "Catálogo inicial: recetas, ingredientes, pasos, colecciones y taxonomía",
    statements: [
      `CREATE TABLE IF NOT EXISTS recipes (
        slug TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        shortDescription TEXT,
        description TEXT,
        imageUrl TEXT,
        thumbUrl TEXT,
        categorySlug TEXT,
        prepTime INTEGER NOT NULL DEFAULT 0,
        cookingTime INTEGER NOT NULL DEFAULT 0,
        totalTime INTEGER NOT NULL DEFAULT 0,
        difficulty TEXT NOT NULL DEFAULT 'facil',
        portions INTEGER NOT NULL DEFAULT 2,
        nutrition TEXT,
        tips TEXT,
        featured INTEGER NOT NULL DEFAULT 0,
        communitySaves INTEGER NOT NULL DEFAULT 0,
        updatedAt TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_recipes_category ON recipes(categorySlug)`,
      `CREATE INDEX IF NOT EXISTS idx_recipes_total_time ON recipes(totalTime)`,
      `CREATE INDEX IF NOT EXISTS idx_recipes_featured ON recipes(featured)`,

      `CREATE TABLE IF NOT EXISTS ingredients (
        slug TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        pantryCategory TEXT NOT NULL,
        defaultUnit TEXT NOT NULL
      )`,

      `CREATE TABLE IF NOT EXISTS recipe_ingredients (
        recipeSlug TEXT NOT NULL,
        ingredientSlug TEXT NOT NULL,
        quantity REAL,
        unit TEXT NOT NULL,
        note TEXT,
        sortOrder INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (recipeSlug, ingredientSlug, sortOrder)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_ri_recipe ON recipe_ingredients(recipeSlug)`,

      `CREATE TABLE IF NOT EXISTS recipe_steps (
        recipeSlug TEXT NOT NULL,
        stepNumber INTEGER NOT NULL,
        description TEXT NOT NULL,
        durationMinutes INTEGER,
        PRIMARY KEY (recipeSlug, stepNumber)
      )`,

      `CREATE TABLE IF NOT EXISTS recipe_diet_tags (
        recipeSlug TEXT NOT NULL,
        dietSlug TEXT NOT NULL,
        PRIMARY KEY (recipeSlug, dietSlug)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_rdt_diet ON recipe_diet_tags(dietSlug)`,

      `CREATE TABLE IF NOT EXISTS collections (
        slug TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        tagline TEXT,
        description TEXT,
        imageUrl TEXT,
        accentColor TEXT,
        sortOrder INTEGER NOT NULL DEFAULT 0,
        updatedAt TEXT NOT NULL
      )`,

      `CREATE TABLE IF NOT EXISTS recipe_collections (
        recipeSlug TEXT NOT NULL,
        collectionSlug TEXT NOT NULL,
        sortOrder INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (recipeSlug, collectionSlug)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_rc_collection ON recipe_collections(collectionSlug)`,

      `CREATE TABLE IF NOT EXISTS categories (
        slug TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        imageUrl TEXT,
        icon TEXT,
        sortOrder INTEGER NOT NULL DEFAULT 0,
        updatedAt TEXT NOT NULL
      )`,

      `CREATE TABLE IF NOT EXISTS diet_tags (
        slug TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        sortOrder INTEGER NOT NULL DEFAULT 0,
        updatedAt TEXT NOT NULL
      )`,

      `CREATE TABLE IF NOT EXISTS sync_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        lastSyncAt TEXT,
        catalogVersion INTEGER NOT NULL DEFAULT 0,
        lastSuccessAt TEXT
      )`,
      `INSERT OR IGNORE INTO sync_state (id, lastSyncAt, catalogVersion) VALUES (1, NULL, 0)`,

      `CREATE TABLE IF NOT EXISTS image_cache (
        remoteUrl TEXT PRIMARY KEY,
        localPath TEXT NOT NULL,
        bytes INTEGER NOT NULL DEFAULT 0,
        downloadedAt TEXT NOT NULL
      )`,
    ],
  },
  {
    version: 2,
    description: "Galería: hasta ocho fotos por receta",
    statements: [
      /*
       * Fotos de cada receta.
       *
       * Las columnas `imageUrl` y `thumbUrl` de `recipes` se conservan intactas y
       * siguen guardando la portada: los listados las leen, y cambiarlas obligaría
       * a tocar consultas que hoy funcionan.
       *
       * La clave primaria compuesta evita duplicar la misma foto en una receta si
       * una sincronización se repite.
       */
      `CREATE TABLE IF NOT EXISTS recipe_photos (
        recipeSlug TEXT NOT NULL,
        imageUrl TEXT NOT NULL,
        thumbUrl TEXT,
        altText TEXT,
        sortOrder INTEGER NOT NULL DEFAULT 0,
        isCover INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (recipeSlug, imageUrl)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_recipe_photos_slug ON recipe_photos(recipeSlug, sortOrder)`,
    ],
  },
  {
    version: 3,
    description: "Tips extra y encabezados de grupos en recetas",
    statements: [
      // Migración deliberadamente aditiva: las bases existentes conservan todo
      // el catálogo y cualquier dato personal que viva en otras tablas.
      `ALTER TABLE recipes ADD COLUMN extraTips TEXT`,
      `ALTER TABLE recipe_ingredients ADD COLUMN type TEXT NOT NULL DEFAULT 'ingredient'`,
      `ALTER TABLE recipe_ingredients ADD COLUMN groupTitle TEXT`,
      `ALTER TABLE recipe_steps ADD COLUMN type TEXT NOT NULL DEFAULT 'step'`,
      `ALTER TABLE recipe_steps ADD COLUMN groupTitle TEXT`,
      `ALTER TABLE recipe_steps ADD COLUMN sortOrder INTEGER`,
      `ALTER TABLE sync_state ADD COLUMN recipeFormatVersion INTEGER NOT NULL DEFAULT 1`,
    ],
  },
];

/** Versión de esquema a la que debe llegar la base tras aplicar las migraciones. */
export const TARGET_SCHEMA_VERSION = LOCAL_MIGRATIONS[LOCAL_MIGRATIONS.length - 1].version;

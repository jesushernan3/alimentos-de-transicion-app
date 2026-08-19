CREATE TABLE `recipe_photos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`recipeId` int NOT NULL,
	`imageKey` varchar(320) NOT NULL,
	`thumbKey` varchar(320),
	`altText` varchar(240),
	`sortOrder` int NOT NULL DEFAULT 0,
	`isCover` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `recipe_photos_id` PRIMARY KEY(`id`),
	CONSTRAINT `recipe_photos_recipe_image_unique` UNIQUE(`recipeId`,`imageKey`)
);
--> statement-breakpoint
CREATE INDEX `recipe_photos_recipeId_idx` ON `recipe_photos` (`recipeId`,`sortOrder`);
--> statement-breakpoint
-- Portada única por receta.
--
-- MySQL no admite índices únicos parciales (`WHERE isCover = 1`), así que se usa
-- una columna generada que vale `recipeId` cuando la foto es portada y NULL en el
-- resto. Como los índices únicos ignoran los nulos, el efecto es exactamente el
-- de un índice parcial: una sola portada por receta, garantizado por la base y no
-- por el código.
ALTER TABLE `recipe_photos` ADD COLUMN `coverGuard` INT
  GENERATED ALWAYS AS (CASE WHEN `isCover` = 1 THEN `recipeId` ELSE NULL END) VIRTUAL;
--> statement-breakpoint
CREATE UNIQUE INDEX `recipe_photos_single_cover` ON `recipe_photos` (`coverGuard`);
--> statement-breakpoint
-- Migración de datos: la foto que ya tenía cada receta pasa a ser su portada.
--
-- Es idempotente por el NOT EXISTS y no borra ni modifica `recipes`: `imageKey` y
-- `thumbKey` siguen siendo la fuente que lee la aplicación ya publicada.
INSERT INTO `recipe_photos` (`recipeId`, `imageKey`, `thumbKey`, `sortOrder`, `isCover`)
SELECT r.`id`, r.`imageKey`, r.`thumbKey`, 0, TRUE
  FROM `recipes` r
 WHERE r.`imageKey` IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM `recipe_photos` p WHERE p.`recipeId` = r.`id`);

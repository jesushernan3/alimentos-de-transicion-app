CREATE TABLE `accessCodes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`codeHash` varchar(128) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`consumedAt` timestamp,
	`attempts` int NOT NULL DEFAULT 0,
	`deliveredVia` enum('pending','email','manual') NOT NULL DEFAULT 'pending',
	`debugCode` varchar(12),
	`requestIp` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `accessCodes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `catalogState` (
	`id` int NOT NULL,
	`catalogVersion` int NOT NULL DEFAULT 1,
	`publishedRecipes` int NOT NULL DEFAULT 0,
	`lastChangeAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `catalogState_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slug` varchar(120) NOT NULL,
	`name` varchar(160) NOT NULL,
	`description` text,
	`imageKey` varchar(320),
	`icon` varchar(64),
	`sortOrder` int NOT NULL DEFAULT 0,
	`published` boolean NOT NULL DEFAULT true,
	`version` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `categories_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `collections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slug` varchar(120) NOT NULL,
	`name` varchar(180) NOT NULL,
	`tagline` varchar(240),
	`description` text,
	`imageKey` varchar(320),
	`accentColor` varchar(16),
	`sortOrder` int NOT NULL DEFAULT 0,
	`published` boolean NOT NULL DEFAULT true,
	`version` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `collections_id` PRIMARY KEY(`id`),
	CONSTRAINT `collections_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `deletions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`entity` enum('recipe','collection','category','dietTag','ingredient') NOT NULL,
	`entityId` int NOT NULL,
	`slug` varchar(160),
	`deletedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `deletions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `dietTags` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slug` varchar(120) NOT NULL,
	`name` varchar(160) NOT NULL,
	`description` text,
	`sortOrder` int NOT NULL DEFAULT 0,
	`published` boolean NOT NULL DEFAULT true,
	`version` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `dietTags_id` PRIMARY KEY(`id`),
	CONSTRAINT `dietTags_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `ingredients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slug` varchar(120) NOT NULL,
	`name` varchar(160) NOT NULL,
	`pantryCategory` varchar(48) NOT NULL,
	`defaultUnit` varchar(24) NOT NULL,
	`version` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ingredients_id` PRIMARY KEY(`id`),
	CONSTRAINT `ingredients_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `licenseEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`licenseId` int,
	`email` varchar(320) NOT NULL,
	`action` enum('granted','revoked','reactivated','refunded','imported','shopify_paid','shopify_refunded') NOT NULL,
	`actorEmail` varchar(320),
	`detail` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `licenseEvents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `licenses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`email` varchar(320) NOT NULL,
	`productId` varchar(96) NOT NULL DEFAULT 'alimentos-de-transicion',
	`source` enum('manual','shopify','import','gift') NOT NULL DEFAULT 'manual',
	`externalOrderId` varchar(128),
	`status` enum('active','pending','revoked','refunded') NOT NULL DEFAULT 'active',
	`notes` text,
	`activatedAt` timestamp,
	`expiresAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `licenses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `recipeCollections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`recipeId` int NOT NULL,
	`collectionId` int NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	CONSTRAINT `recipeCollections_id` PRIMARY KEY(`id`),
	CONSTRAINT `recipeCollections_pair_idx` UNIQUE(`recipeId`,`collectionId`)
);
--> statement-breakpoint
CREATE TABLE `recipeDietTags` (
	`id` int AUTO_INCREMENT NOT NULL,
	`recipeId` int NOT NULL,
	`dietTagId` int NOT NULL,
	CONSTRAINT `recipeDietTags_id` PRIMARY KEY(`id`),
	CONSTRAINT `recipeDietTags_pair_idx` UNIQUE(`recipeId`,`dietTagId`)
);
--> statement-breakpoint
CREATE TABLE `recipeIngredients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`recipeId` int NOT NULL,
	`ingredientId` int NOT NULL,
	`quantity` varchar(24),
	`unit` varchar(24) NOT NULL,
	`note` varchar(240),
	`sortOrder` int NOT NULL DEFAULT 0,
	CONSTRAINT `recipeIngredients_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `recipeSteps` (
	`id` int AUTO_INCREMENT NOT NULL,
	`recipeId` int NOT NULL,
	`stepNumber` int NOT NULL,
	`description` text NOT NULL,
	`durationMinutes` int,
	CONSTRAINT `recipeSteps_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `recipes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slug` varchar(160) NOT NULL,
	`title` varchar(240) NOT NULL,
	`shortDescription` varchar(400),
	`description` text,
	`imageKey` varchar(320),
	`thumbKey` varchar(320),
	`gallery` json,
	`categoryId` int,
	`prepTime` int NOT NULL DEFAULT 0,
	`cookingTime` int NOT NULL DEFAULT 0,
	`totalTime` int NOT NULL DEFAULT 0,
	`difficulty` enum('facil','intermedia','avanzada') NOT NULL DEFAULT 'facil',
	`portions` int NOT NULL DEFAULT 2,
	`nutrition` json,
	`tips` text,
	`notes` text,
	`featured` boolean NOT NULL DEFAULT false,
	`communitySaves` int NOT NULL DEFAULT 0,
	`status` enum('draft','published','archived') NOT NULL DEFAULT 'draft',
	`version` int NOT NULL DEFAULT 1,
	`publishedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `recipes_id` PRIMARY KEY(`id`),
	CONSTRAINT `recipes_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`tokenHash` varchar(128) NOT NULL,
	`deviceLabel` varchar(160),
	`platform` varchar(32),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`lastSeenAt` timestamp NOT NULL DEFAULT (now()),
	`revokedAt` timestamp,
	CONSTRAINT `sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `sessions_tokenHash_unique` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
CREATE INDEX `accessCodes_email_idx` ON `accessCodes` (`email`);--> statement-breakpoint
CREATE INDEX `categories_updatedAt_idx` ON `categories` (`updatedAt`);--> statement-breakpoint
CREATE INDEX `collections_updatedAt_idx` ON `collections` (`updatedAt`);--> statement-breakpoint
CREATE INDEX `deletions_deletedAt_idx` ON `deletions` (`deletedAt`);--> statement-breakpoint
CREATE INDEX `dietTags_updatedAt_idx` ON `dietTags` (`updatedAt`);--> statement-breakpoint
CREATE INDEX `ingredients_updatedAt_idx` ON `ingredients` (`updatedAt`);--> statement-breakpoint
CREATE INDEX `licenseEvents_licenseId_idx` ON `licenseEvents` (`licenseId`);--> statement-breakpoint
CREATE INDEX `licenses_email_idx` ON `licenses` (`email`);--> statement-breakpoint
CREATE INDEX `licenses_status_idx` ON `licenses` (`status`);--> statement-breakpoint
CREATE INDEX `recipeCollections_collectionId_idx` ON `recipeCollections` (`collectionId`);--> statement-breakpoint
CREATE INDEX `recipeIngredients_recipeId_idx` ON `recipeIngredients` (`recipeId`);--> statement-breakpoint
CREATE INDEX `recipeSteps_recipeId_idx` ON `recipeSteps` (`recipeId`);--> statement-breakpoint
CREATE INDEX `recipes_status_idx` ON `recipes` (`status`);--> statement-breakpoint
CREATE INDEX `recipes_updatedAt_idx` ON `recipes` (`updatedAt`);--> statement-breakpoint
CREATE INDEX `recipes_categoryId_idx` ON `recipes` (`categoryId`);--> statement-breakpoint
CREATE INDEX `sessions_userId_idx` ON `sessions` (`userId`);--> statement-breakpoint
CREATE INDEX `users_email_idx` ON `users` (`email`);
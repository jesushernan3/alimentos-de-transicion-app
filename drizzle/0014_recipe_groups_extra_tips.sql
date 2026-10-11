ALTER TABLE `recipeIngredients` MODIFY COLUMN `ingredientId` int;--> statement-breakpoint
ALTER TABLE `recipeIngredients` MODIFY COLUMN `unit` varchar(24);--> statement-breakpoint
ALTER TABLE `recipeIngredients` ADD `type` enum('ingredient','group') DEFAULT 'ingredient' NOT NULL;--> statement-breakpoint
ALTER TABLE `recipeIngredients` ADD `groupTitle` varchar(240);--> statement-breakpoint
ALTER TABLE `recipeSteps` ADD `type` enum('step','group') DEFAULT 'step' NOT NULL;--> statement-breakpoint
ALTER TABLE `recipeSteps` ADD `groupTitle` varchar(240);--> statement-breakpoint
ALTER TABLE `recipeSteps` ADD `sortOrder` int;--> statement-breakpoint
ALTER TABLE `recipes` ADD `extraTips` text;
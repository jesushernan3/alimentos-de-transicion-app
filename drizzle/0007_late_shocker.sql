ALTER TABLE `shopifyWebhookEvents` ADD `deliveryEmailStatus` enum('not_applicable','pending','sending','sent','failed') DEFAULT 'not_applicable' NOT NULL;--> statement-breakpoint
ALTER TABLE `shopifyWebhookEvents` ADD `deliveryEmailAttempts` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `shopifyWebhookEvents` ADD `deliveryEmailLastAttemptAt` timestamp;--> statement-breakpoint
ALTER TABLE `shopifyWebhookEvents` ADD `deliveryEmailSentAt` timestamp;--> statement-breakpoint
ALTER TABLE `shopifyWebhookEvents` ADD `deliveryEmailProviderId` varchar(128);--> statement-breakpoint
ALTER TABLE `shopifyWebhookEvents` ADD `deliveryEmailError` text;
CREATE TABLE `shopifyWebhookEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`webhookId` varchar(128),
	`shopifyOrderId` varchar(128) NOT NULL,
	`shopDomain` varchar(255),
	`topic` varchar(64) NOT NULL DEFAULT 'orders/paid',
	`email` varchar(320),
	`productId` varchar(96),
	`variantId` varchar(96),
	`financialStatus` varchar(48),
	`result` enum('license_created','license_reactivated','license_existing','ignored_product','invalid_email') NOT NULL,
	`detail` text,
	`payloadHash` varchar(64) NOT NULL,
	`processedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `shopifyWebhookEvents_id` PRIMARY KEY(`id`),
	CONSTRAINT `shopifyWebhookEvents_order_unique` UNIQUE(`shopifyOrderId`),
	CONSTRAINT `shopifyWebhookEvents_webhook_unique` UNIQUE(`webhookId`)
);
--> statement-breakpoint
CREATE INDEX `shopifyWebhookEvents_email_idx` ON `shopifyWebhookEvents` (`email`);--> statement-breakpoint
CREATE INDEX `shopifyWebhookEvents_result_idx` ON `shopifyWebhookEvents` (`result`);
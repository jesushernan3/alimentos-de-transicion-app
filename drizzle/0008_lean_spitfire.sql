CREATE TABLE `shopifyWebhookAttempts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`webhookId` varchar(128),
	`shopDomain` varchar(255),
	`topic` varchar(64),
	`hmacStatus` enum('unchecked','valid','invalid','missing','config_missing') NOT NULL DEFAULT 'unchecked',
	`httpStatus` int,
	`contentLength` int NOT NULL DEFAULT 0,
	`receivedAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `shopifyWebhookAttempts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `shopifyWebhookAttempts_webhook_idx` ON `shopifyWebhookAttempts` (`webhookId`);--> statement-breakpoint
CREATE INDEX `shopifyWebhookAttempts_received_idx` ON `shopifyWebhookAttempts` (`receivedAt`);--> statement-breakpoint
CREATE INDEX `shopifyWebhookAttempts_hmac_idx` ON `shopifyWebhookAttempts` (`hmacStatus`);
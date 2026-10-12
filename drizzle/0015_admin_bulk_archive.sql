CREATE TABLE `adminBulkOperations` (
	`operationId` varchar(36) NOT NULL,
	`requestHash` varchar(64) NOT NULL,
	`entity` enum('recipes','licenses') NOT NULL,
	`action` varchar(24) NOT NULL,
	`actor` varchar(120) NOT NULL,
	`ids` json NOT NULL,
	`status` enum('processing','completed','failed') NOT NULL DEFAULT 'processing',
	`succeeded` int NOT NULL DEFAULT 0,
	`unchanged` int NOT NULL DEFAULT 0,
	`failed` int NOT NULL DEFAULT 0,
	`result` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `adminBulkOperations_operationId` PRIMARY KEY(`operationId`)
);
--> statement-breakpoint
ALTER TABLE `licenses` ADD `archivedAt` timestamp;
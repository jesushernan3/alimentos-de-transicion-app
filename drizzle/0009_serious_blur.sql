CREATE TABLE `shopifyReconciliationState` (
	`id` int NOT NULL,
	`scheduleCronTaskUid` varchar(128),
	`runningSince` timestamp,
	`lastStartedAt` timestamp,
	`lastCompletedAt` timestamp,
	`lastStatus` enum('never','success','partial','failed') NOT NULL DEFAULT 'never',
	`lastMode` enum('automatic','manual_recent','manual_order'),
	`lastScanned` int NOT NULL DEFAULT 0,
	`lastProcessed` int NOT NULL DEFAULT 0,
	`lastDuplicates` int NOT NULL DEFAULT 0,
	`lastErrors` int NOT NULL DEFAULT 0,
	`lastDetail` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `shopifyReconciliationState_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
INSERT IGNORE INTO `shopifyReconciliationState` (`id`) VALUES (1);

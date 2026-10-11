CREATE TABLE `shopifyReconciliationRuns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`runUid` varchar(64) NOT NULL,
	`trigger` enum('cron','simulation') NOT NULL,
	`status` enum('running','success','error','skipped') NOT NULL DEFAULT 'running',
	`result` varchar(64) NOT NULL,
	`startedAt` timestamp NOT NULL,
	`completedAt` timestamp,
	`durationMs` int,
	`scanned` int NOT NULL DEFAULT 0,
	`processed` int NOT NULL DEFAULT 0,
	`duplicates` int NOT NULL DEFAULT 0,
	`errors` int NOT NULL DEFAULT 0,
	`technicalMessage` text,
	`errorFingerprint` varchar(64),
	`alertStatus` enum('not_required','pending','sent','suppressed','failed','not_configured') NOT NULL DEFAULT 'not_required',
	`alertSentAt` timestamp,
	`alertProviderId` varchar(128),
	`alertError` text,
	`recoveryAlertStatus` enum('not_required','pending','sent','failed','not_configured') NOT NULL DEFAULT 'not_required',
	`recoveryAlertSentAt` timestamp,
	`recoveryAlertProviderId` varchar(128),
	`recoveryAlertError` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `shopifyReconciliationRuns_id` PRIMARY KEY(`id`),
	CONSTRAINT `shopifyReconciliationRuns_runUid_unique` UNIQUE(`runUid`)
);
--> statement-breakpoint
CREATE INDEX `shopifyReconciliationRuns_startedAt_idx` ON `shopifyReconciliationRuns` (`startedAt`);--> statement-breakpoint
CREATE INDEX `shopifyReconciliationRuns_status_idx` ON `shopifyReconciliationRuns` (`status`);--> statement-breakpoint
CREATE INDEX `shopifyReconciliationRuns_fingerprint_idx` ON `shopifyReconciliationRuns` (`errorFingerprint`);
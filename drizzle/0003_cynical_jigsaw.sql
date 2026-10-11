CREATE TABLE `licenseDevices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`licenseId` int NOT NULL,
	`email` varchar(320) NOT NULL,
	`deviceId` varchar(128) NOT NULL,
	`deviceLabel` varchar(160),
	`platform` varchar(32),
	`appVersion` varchar(32),
	`registeredAt` timestamp NOT NULL DEFAULT (now()),
	`lastActivityAt` timestamp NOT NULL DEFAULT (now()),
	`revokedAt` timestamp,
	`revokedBy` varchar(320),
	`revokeReason` varchar(240),
	CONSTRAINT `licenseDevices_id` PRIMARY KEY(`id`),
	CONSTRAINT `licenseDevices_license_device_unique` UNIQUE(`licenseId`,`deviceId`)
);
--> statement-breakpoint
ALTER TABLE `sessions` ADD `licenseDeviceId` int;--> statement-breakpoint
CREATE INDEX `licenseDevices_licenseId_idx` ON `licenseDevices` (`licenseId`);--> statement-breakpoint
CREATE INDEX `licenseDevices_active_idx` ON `licenseDevices` (`licenseId`,`revokedAt`);--> statement-breakpoint
CREATE INDEX `sessions_licenseDeviceId_idx` ON `sessions` (`licenseDeviceId`);
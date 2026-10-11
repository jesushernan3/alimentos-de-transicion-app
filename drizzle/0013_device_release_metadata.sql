ALTER TABLE `licenseDevices` ADD `manufacturer` varchar(120);--> statement-breakpoint
ALTER TABLE `licenseDevices` ADD `modelName` varchar(160);--> statement-breakpoint
ALTER TABLE `licenseDevices` ADD `modelId` varchar(120);--> statement-breakpoint
ALTER TABLE `licenseDevices` ADD `osVersion` varchar(64);--> statement-breakpoint
ALTER TABLE `licenseDevices` ADD `releasedAt` timestamp;
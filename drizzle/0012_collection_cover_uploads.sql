CREATE TABLE `collectionCoverUploads` (
	`operationId` varchar(36) NOT NULL,
	`imageKey` varchar(320) NOT NULL,
	`requestHash` varchar(64) NOT NULL,
	`collectionId` int,
	`status` enum('reserved','uploaded','attached') NOT NULL DEFAULT 'reserved',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `collectionCoverUploads_operationId` PRIMARY KEY(`operationId`),
	CONSTRAINT `collectionCoverUploads_imageKey_unique` UNIQUE(`imageKey`)
);

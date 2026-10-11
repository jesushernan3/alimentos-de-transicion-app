ALTER TABLE `licenses` ADD `firstLoginAt` timestamp;--> statement-breakpoint
ALTER TABLE `licenses` ADD `lastLoginAt` timestamp;--> statement-breakpoint
ALTER TABLE `licenses` ADD `accessTrackingStartedAt` timestamp;--> statement-breakpoint

-- Una sesión sólo se crea después de validar correctamente el código (o el
-- acceso fijo de Google Review) y comprobar una licencia activa. Por eso sus
-- fechas de creación son evidencia histórica confiable de login real.
--
-- No se asigna accessTrackingStartedAt a licencias históricas sin sesiones:
-- deben mostrarse como «Sin datos», no como «Pendiente», porque no sabemos si
-- ingresaron antes de que existiera este seguimiento.
UPDATE `licenses` AS l
INNER JOIN (
  SELECT
    `userId`,
    MIN(`createdAt`) AS `firstLoginAt`,
    MAX(`createdAt`) AS `lastLoginAt`
  FROM `sessions`
  GROUP BY `userId`
) AS historical ON historical.`userId` = l.`userId`
SET
  l.`firstLoginAt` = COALESCE(l.`firstLoginAt`, historical.`firstLoginAt`),
  l.`lastLoginAt` = COALESCE(l.`lastLoginAt`, historical.`lastLoginAt`);

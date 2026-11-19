-- Base de données de l'ERP W.A.Y.S. (MySQL 5.7+ / MariaDB 10.3+)
-- À importer une fois dans phpMyAdmin (panneau ONE.COM).

CREATE TABLE IF NOT EXISTS ways_docs (
  coll        VARCHAR(64)  NOT NULL,
  id          VARCHAR(191) NOT NULL,
  data        LONGTEXT     NOT NULL,          -- document JSON
  rev         BIGINT       NOT NULL,          -- n° de révision global (pour les mises à jour en direct)
  updated_at  BIGINT       NOT NULL,          -- horodatage en millisecondes
  updated_by  VARCHAR(191) NULL,
  deleted     TINYINT(1)   NOT NULL DEFAULT 0,
  PRIMARY KEY (coll, id),
  KEY idx_rev (rev),
  KEY idx_coll_rev (coll, rev)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ways_meta (
  k  VARCHAR(64) NOT NULL PRIMARY KEY,
  v  BIGINT      NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO ways_meta (k, v) VALUES ('rev', 0);

CREATE TABLE IF NOT EXISTS ways_files (
  id          VARCHAR(64)  NOT NULL PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  mime        VARCHAR(127) NOT NULL,
  size        BIGINT       NOT NULL,
  created_at  BIGINT       NOT NULL,
  created_by  VARCHAR(191) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

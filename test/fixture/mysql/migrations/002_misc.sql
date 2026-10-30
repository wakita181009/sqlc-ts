CREATE TABLE misc (
  label VARCHAR(255) NOT NULL,
  small SMALLINT,
  medium MEDIUMINT,
  big BIGINT,
  ubig BIGINT UNSIGNED,
  precise DOUBLE,
  flag TINYINT(1) NOT NULL DEFAULT 0,
  bits BIT(1),
  at_local TIMESTAMP NULL,
  at_time TIME,
  year_made YEAR,
  fixed CHAR(10),
  body TEXT,
  raw VARBINARY(16),
  kind SET('a', 'b')
);

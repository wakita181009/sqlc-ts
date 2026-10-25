-- migrate:up
CREATE TABLE misc (
  id uuid PRIMARY KEY,
  small smallint NOT NULL,
  medium integer,
  precise double precision,
  flag boolean NOT NULL DEFAULT false,
  at_local timestamp,
  at_time time,
  span interval,
  doc json,
  fixed char(10),
  label varchar(255) NOT NULL,
  prices numeric[],
  grid integer[][],
  address_line1 text
);

-- migrate:down
DROP TABLE misc;

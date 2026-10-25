-- migrate:up
CREATE TYPE episode_status AS ENUM ('draft', 'published');

CREATE TABLE titles (
  id bigserial PRIMARY KEY,
  name text NOT NULL,
  status episode_status NOT NULL DEFAULT 'draft',
  tags text[] NOT NULL DEFAULT '{}',
  price numeric(10, 2),
  meta jsonb,
  poster bytea,
  rating real,
  published_on date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE views (
  title_id bigint NOT NULL REFERENCES titles (id),
  viewed_at timestamptz NOT NULL DEFAULT now()
);

-- migrate:down
DROP TABLE views;
DROP TABLE titles;
DROP TYPE episode_status;

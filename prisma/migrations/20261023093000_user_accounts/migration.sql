-- Accounts: permanent public IDs, unique usernames, account status and role.
-- Existing users keep everything; they get a public ID in registration order, and are asked to choose a username.

CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

CREATE SEQUENCE "users_public_id_seq" AS BIGINT START 1;

ALTER TABLE "users"
  ADD COLUMN "publicId" TEXT,
  ADD COLUMN "username" TEXT,
  ADD COLUMN "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'USER',
  ADD COLUMN "suspendedAt" TIMESTAMP(3),
  ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Backfill public IDs in registration order (LOC-000001 is the first account).
UPDATE "users" u
SET "publicId" = 'LOC-' || lpad(nextval('users_public_id_seq')::text, 6, '0')
FROM (SELECT id FROM "users" ORDER BY "createdAt", id) ordered
WHERE u.id = ordered.id;

-- The UPDATE above assigns in physical order; reassign deterministically by registration order.
WITH ranked AS (SELECT id, row_number() OVER (ORDER BY "createdAt", id) AS n FROM "users")
UPDATE "users" u SET "publicId" = 'LOC-' || lpad(ranked.n::text, 6, '0') FROM ranked WHERE u.id = ranked.id;
SELECT setval('users_public_id_seq', GREATEST((SELECT count(*) FROM "users"), 1), (SELECT count(*) FROM "users") > 0);

ALTER TABLE "users"
  ALTER COLUMN "publicId" SET NOT NULL,
  ALTER COLUMN "publicId" SET DEFAULT ('LOC-'::text || lpad((nextval('users_public_id_seq'::regclass))::text, 6, '0'::text));
ALTER SEQUENCE "users_public_id_seq" OWNED BY "users"."publicId";

CREATE UNIQUE INDEX "users_publicId_key" ON "users"("publicId");
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- Usernames are stored normalised (lowercase), so the unique index is case-insensitive in effect.
ALTER TABLE "users" ADD CONSTRAINT "users_username_format" CHECK ("username" IS NULL OR "username" ~ '^[a-z][a-z0-9_]{2,23}$');

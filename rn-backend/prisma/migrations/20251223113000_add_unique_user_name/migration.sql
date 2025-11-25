-- Deduplicate existing names before enforcing uniqueness
WITH duplicates AS (
  SELECT
    id,
    name,
    ROW_NUMBER() OVER (PARTITION BY name ORDER BY "createdAt", id) AS row_num
  FROM "User"
  WHERE name IS NOT NULL
),
updated AS (
  UPDATE "User" u
  SET name = CONCAT(u.name, ' (', SUBSTRING(u.id, 1, 6), ')')
  FROM duplicates d
  WHERE u.id = d.id AND d.row_num > 1
  RETURNING u.id
)
SELECT COUNT(*) FROM updated;

-- Enforce unique display names for user registration
CREATE UNIQUE INDEX IF NOT EXISTS "User_name_key" ON "User"("name");

-- Backfill legacy benchmark versions with semver labels.
-- Query existing versions ordered by created_at and assign sequential semver labels.
-- This assigns 1.0.0-beta.1, 1.0.0-beta.2, etc. to all existing versions.

WITH ranked_versions AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (ORDER BY created_at ASC) as row_num
  FROM benchmark_versions
  WHERE semver IS NULL
)
UPDATE benchmark_versions
SET 
  semver = '1.0.0-beta.' || (SELECT row_num FROM ranked_versions rv WHERE rv.id = benchmark_versions.id),
  label = 'Legacy version'
WHERE semver IS NULL;

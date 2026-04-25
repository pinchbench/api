-- Backfill semver and label columns on benchmark_versions.
-- Columns are added in the prior migration (20260406_add_semver_columns.sql).
UPDATE benchmark_versions
SET semver = CASE 
    WHEN id GLOB '[0-9]*.[0-9]*' OR id GLOB '[0-9]*.[0-9]*.[0-9]*' THEN id
    ELSE '0.0.1'
  END,
  label = CASE 
    WHEN id GLOB '[0-9]*.[0-9]*' OR id GLOB '[0-9]*.[0-9]*.[0-9]*' THEN id
    ELSE '0.0.1'
  END
WHERE semver IS NULL OR label IS NULL;

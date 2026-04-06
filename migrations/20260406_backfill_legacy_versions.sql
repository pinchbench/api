-- Backfill legacy git-hash versions with semver 1.0.0-beta.N
-- This migration should be run AFTER 20260406_add_semver_columns.sql
--
-- Note: D1 doesn't allow CREATE TEMPORARY TABLE, so we use a correlated subquery instead.

UPDATE benchmark_versions
SET 
  semver = '1.0.0-beta.' || CAST((
    SELECT COUNT(*) + 1 
    FROM benchmark_versions bv2 
    WHERE bv2.semver IS NULL 
      AND bv2.created_at < benchmark_versions.created_at
  ) AS TEXT),
  label = '1.0.0-beta.' || CAST((
    SELECT COUNT(*) + 1 
    FROM benchmark_versions bv2 
    WHERE bv2.semver IS NULL 
      AND bv2.created_at < benchmark_versions.created_at
  ) AS TEXT)
WHERE semver IS NULL;

-- Verification query (run separately to verify results):
-- SELECT id, semver, label, created_at FROM benchmark_versions ORDER BY created_at ASC;

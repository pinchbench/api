-- Fix for api#40: Assign correct sequential semver to legacy versions
-- 
-- The previous migration (20260406_backfill_legacy_versions.sql) had a bug where it used
-- a correlated subquery that referenced the same table being updated with the same
-- WHERE condition (bv2.semver IS NULL). During execution, this caused all rows to
-- incorrectly get assigned '1.0.0-beta.1' because the subquery couldn't properly
-- evaluate the relative ordering during the UPDATE.
--
-- This migration fixes the issue by using a safer approach with ROW_NUMBER() window function
-- in a subquery that doesn't reference the table being modified.

-- Reset any rows that have the incorrect '1.0.0-beta.1' value
-- (or any semver starting with '1.0.0-beta.' where we need to reassign)
UPDATE benchmark_versions
SET semver = NULL, label = NULL
WHERE semver LIKE '1.0.0-beta.%';

-- Now assign correct sequential semver values
-- First version gets beta.1, second gets beta.2, etc.
UPDATE benchmark_versions
SET 
  semver = (
    SELECT new_semver FROM (
      SELECT 
        id,
        '1.0.0-beta.' || CAST(ROW_NUMBER() OVER (ORDER BY created_at ASC) AS TEXT) as new_semver
      FROM benchmark_versions
      WHERE semver IS NULL
    ) numbered
    WHERE numbered.id = benchmark_versions.id
  ),
  label = (
    SELECT new_label FROM (
      SELECT 
        id,
        '1.0.0-beta.' || CAST(ROW_NUMBER() OVER (ORDER BY created_at ASC) AS TEXT) as new_label
      FROM benchmark_versions
      WHERE semver IS NULL
    ) numbered
    WHERE numbered.id = benchmark_versions.id
  )
WHERE semver IS NULL;

-- Verification query:
-- SELECT id, semver, label, created_at FROM benchmark_versions ORDER BY created_at ASC;

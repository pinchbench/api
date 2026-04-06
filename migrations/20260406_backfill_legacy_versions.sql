-- Backfill migration: Assign semver labels to legacy git-hash benchmark versions
-- Run order: 20260406_add_semver_columns.sql must run first
-- This script assigns 1.0.0-beta.N labels to all existing versions ordered by created_at ASC

-- Single UPDATE with correlated subquery to assign sequential beta versions
UPDATE benchmark_versions
SET 
    semver = '1.0.0-beta.' || (
        SELECT COUNT(*) + 1 
        FROM benchmark_versions AS older 
        WHERE older.created_at < benchmark_versions.created_at 
           OR (older.created_at = benchmark_versions.created_at AND older.rowid < benchmark_versions.rowid)
    ),
    label = '1.0.0-beta.' || (
        SELECT COUNT(*) + 1 
        FROM benchmark_versions AS older 
        WHERE older.created_at < benchmark_versions.created_at 
           OR (older.created_at = benchmark_versions.created_at AND older.rowid < benchmark_versions.rowid)
    )
WHERE semver IS NULL;

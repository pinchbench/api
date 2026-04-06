-- Backfill legacy git-hash versions with semver 1.0.0-beta.N
-- Existing versions (identified by git hashes) should be assigned sequential beta versions
-- ordered by created_at ASC. This ensures deterministic assignment.

-- First, let's see what versions exist and their creation order
-- SELECT id, created_at FROM benchmark_versions ORDER BY created_at ASC;

-- Example UPDATE statements (uncomment and run after verifying the data):
-- UPDATE benchmark_versions SET semver = '1.0.0-beta.1' WHERE id = '<first_git_hash_id>';
-- UPDATE benchmark_versions SET semver = '1.0.0-beta.2' WHERE id = '<second_git_hash_id>';
-- ... and so on

-- For dynamic backfill (SQLite doesn't support window functions well, so use a procedural approach):
-- 1. Get ordered list of existing benchmark_versions without semver
-- 2. Assign 1.0.0-beta.1, 1.0.0-beta.2, etc. in order of created_at

-- Manual approach: First query to find how many legacy versions exist
-- SELECT COUNT(*) FROM benchmark_versions WHERE semver IS NULL;

-- Then run individual UPDATE statements for each legacy version:
-- UPDATE benchmark_versions SET semver = '1.0.0-beta.1', label = 'Legacy Version 1' WHERE id = (SELECT id FROM benchmark_versions WHERE semver IS NULL ORDER BY created_at ASC LIMIT 1);
-- UPDATE benchmark_versions SET semver = '1.0.0-beta.2', label = 'Legacy Version 2' WHERE id = (SELECT id FROM benchmark_versions WHERE semver IS NULL ORDER BY created_at ASC LIMIT 1 OFFSET 1);
-- ... continue for each legacy version

-- Note: The label field is optional - it can be used to provide a human-readable name
-- If you want auto-generated labels: CONCAT('Legacy Version ', row_number)

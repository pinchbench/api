ALTER TABLE benchmark_versions ADD COLUMN semver TEXT;
ALTER TABLE benchmark_versions ADD COLUMN label TEXT;
ALTER TABLE benchmark_versions ADD COLUMN release_notes TEXT;
ALTER TABLE benchmark_versions ADD COLUMN release_url TEXT;
CREATE INDEX IF NOT EXISTS idx_benchmark_versions_semver ON benchmark_versions(semver);

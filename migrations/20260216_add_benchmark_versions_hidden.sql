-- Add hidden flag to benchmark_versions to suppress bad/broken versions from all API responses
ALTER TABLE benchmark_versions ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0;

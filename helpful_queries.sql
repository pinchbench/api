-- Find latest benchmark version and count of submissions
SELECT 
  benchmark_version,
  count(*) as count,
  max(created_at) as latest
FROM submissions
GROUP BY benchmark_version
ORDER BY 3 DESC;

-- Delete all submissions with 0% score
-- WARNING: This is a destructive operation and cannot be undone
-- First, preview what will be deleted:
SELECT id, model, provider, score_percentage, created_at
FROM submissions
WHERE score_percentage = 0;

-- Then, if you're sure, delete them:
DELETE FROM submissions
WHERE score_percentage = 0;
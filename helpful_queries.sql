-- Find latest benchmark version and count of submissions
SELECT 
  benchmark_version,
  count(*) as count,
  max(created_at) as latest
FROM submissions
GROUP BY benchmark_version
ORDER BY 3 DESC
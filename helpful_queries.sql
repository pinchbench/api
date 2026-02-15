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

-- Find all submissions from a particular IP address
-- This query joins submissions with raw_post_logs to find submissions by IP
-- Replace 'YOUR_IP_ADDRESS' with the actual IP address you're looking for
SELECT 
  s.id,
  s.model,
  s.provider,
  s.score_percentage,
  s.timestamp,
  s.created_at,
  s.benchmark_version,
  rpl.ip,
  rpl.created_at as request_time
FROM submissions s
JOIN raw_post_logs rpl 
  ON rpl.path = '/api/submit' 
  AND datetime(rpl.created_at) BETWEEN datetime(s.created_at, '-5 seconds') AND datetime(s.created_at, '+5 seconds')
WHERE rpl.ip = 'YOUR_IP_ADDRESS'
ORDER BY s.created_at DESC;

-- Alternative: Find IP addresses associated with a token's registrations
-- This shows which IPs were used to register tokens
SELECT 
  s.id as submission_id,
  s.model,
  s.provider,
  s.score_percentage,
  s.created_at as submission_created_at,
  trl.ip,
  trl.created_at as registration_time
FROM submissions s
JOIN tokens t ON s.token_id = t.id
JOIN token_registration_limits trl 
  ON datetime(trl.created_at) BETWEEN datetime(t.created_at, '-1 hour') AND datetime(t.created_at, '+1 hour')
WHERE trl.ip = '66.42.81.28'
ORDER BY s.created_at DESC;
-- Normalize existing model names by stripping the ":free" suffix.
-- This ensures models like "nvidia/nemotron-3-super-120b-a12b:free" are treated
-- as the same model as "nvidia/nemotron-3-super-120b-a12b" on the leaderboard.

UPDATE submissions
SET model = SUBSTR(model, 1, LENGTH(model) - 5)
WHERE model LIKE '%:free';

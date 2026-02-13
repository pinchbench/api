-- Add token usage columns to submissions for leaderboard rollups
ALTER TABLE submissions ADD COLUMN input_tokens INTEGER;
ALTER TABLE submissions ADD COLUMN output_tokens INTEGER;
ALTER TABLE submissions ADD COLUMN total_tokens INTEGER;

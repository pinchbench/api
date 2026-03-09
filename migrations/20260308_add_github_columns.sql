-- Add GitHub OAuth columns to tokens table
ALTER TABLE tokens ADD COLUMN github_id INTEGER;
ALTER TABLE tokens ADD COLUMN github_username TEXT;

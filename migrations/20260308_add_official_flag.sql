-- Add official flag to submissions
-- Submissions marked official were submitted using the OFFICIAL_KEY secret,
-- indicating they are authoritative/verified benchmark runs.
ALTER TABLE submissions ADD COLUMN official INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_submissions_official ON submissions(official);

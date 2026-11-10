-- Apply after deploying the Worker without raw POST request logging.
-- Preserve separate admin action audit entries (method = 'ADMIN').
DELETE FROM raw_post_logs WHERE method = 'POST';

-- Migration 001: Add new server settings
INSERT INTO server_settings (key, value) VALUES
    ('max_storage_kb', '1024'),
    ('require_email', 'false'),
    ('require_totp', 'false')
ON CONFLICT (key) DO NOTHING;

-- Relax storage constraint to 10MB (application enforces dynamic limit)
ALTER TABLE user_storage DROP CONSTRAINT IF EXISTS storage_size;
ALTER TABLE user_storage ADD CONSTRAINT storage_size CHECK (octet_length(content) <= 10485760);

CREATE TABLE IF NOT EXISTS user_vaults (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    vault TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT vault_size CHECK (octet_length(vault) <= 10485760)
);

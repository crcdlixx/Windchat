-- WindChat Database Schema
-- PostgreSQL

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(32) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name VARCHAR(64),
    avatar_url TEXT,
    role VARCHAR(16) DEFAULT 'user' CHECK (role IN ('user', 'admin', 'superadmin')),
    is_banned BOOLEAN DEFAULT false,
    ban_reason TEXT,
    identity_key TEXT NOT NULL,         -- Signal Protocol public identity key (base64)
    signed_prekey TEXT NOT NULL,        -- Signal Protocol signed prekey bundle (JSON)
    email VARCHAR(255),
    email_verified BOOLEAN NOT NULL DEFAULT false,
    totp_secret TEXT,
    totp_enabled BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_seen TIMESTAMPTZ DEFAULT NOW()
);

-- One-time prekeys for Signal Protocol
CREATE TABLE IF NOT EXISTS one_time_prekeys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key_id INTEGER NOT NULL,
    public_key TEXT NOT NULL,           -- base64 encoded
    used BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, key_id)
);

-- User persistent storage for client-encrypted notes
CREATE TABLE IF NOT EXISTS user_storage (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    content TEXT DEFAULT '',
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT storage_size CHECK (octet_length(content) <= 10485760)
);

-- Client-encrypted key/session backup. Server stores only encrypted JSON.
CREATE TABLE IF NOT EXISTS user_vaults (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    vault TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT vault_size CHECK (octet_length(vault) <= 10485760)
);

-- Groups / Channels
CREATE TABLE IF NOT EXISTS groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(128) NOT NULL,
    description TEXT,
    owner_id UUID NOT NULL REFERENCES users(id),
    type VARCHAR(16) DEFAULT 'private' CHECK (type IN ('public', 'password', 'private')),
    password_hash TEXT,                 -- for 'password' type groups
    is_temporary BOOLEAN DEFAULT false,
    expires_at TIMESTAMPTZ,             -- for temporary groups
    message_ttl_seconds INTEGER DEFAULT 3600 CHECK (message_ttl_seconds BETWEEN 1 AND 86400),
    is_dissolved BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Group members
CREATE TABLE IF NOT EXISTS group_members (
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(16) DEFAULT 'member' CHECK (role IN ('member', 'moderator', 'owner')),
    is_muted BOOLEAN DEFAULT false,
    muted_until TIMESTAMPTZ,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (group_id, user_id)
);

-- Direct message conversations
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_a UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_b UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message_ttl_seconds INTEGER DEFAULT 3600 CHECK (message_ttl_seconds BETWEEN 1 AND 86400),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_a, user_b),
    CHECK (user_a < user_b)
);

-- Messages (DM and group)
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id),
    -- E2E encrypted payload: JSON {ciphertext, iv, ...Signal envelope}
    encrypted_payload TEXT NOT NULL,
    message_type VARCHAR(16) DEFAULT 'text' CHECK (message_type IN ('text', 'file', 'image', 'system')),
    file_ref TEXT,                      -- S3/MinIO object key for file/image messages
    ttl_seconds INTEGER NOT NULL DEFAULT 3600,
    expires_at TIMESTAMPTZ NOT NULL,
    is_deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CHECK (
        (conversation_id IS NOT NULL AND group_id IS NULL) OR
        (conversation_id IS NULL AND group_id IS NOT NULL)
    )
);

-- Message read receipts
CREATE TABLE IF NOT EXISTS message_reads (
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    read_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (message_id, user_id)
);

-- Refresh tokens
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Email verification codes
CREATE TABLE IF NOT EXISTS email_verification_codes (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    code VARCHAR(6) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Server settings (key-value)
CREATE TABLE IF NOT EXISTS server_settings (
    key VARCHAR(64) PRIMARY KEY,
    value TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit log
CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_id UUID REFERENCES users(id),
    action VARCHAR(64) NOT NULL,
    target_type VARCHAR(32),
    target_id UUID,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_messages_conversation_expires ON messages(conversation_id, expires_at) WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_messages_group_expires ON messages(group_id, expires_at) WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_messages_expires_at ON messages(expires_at) WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_one_time_prekeys_user ON one_time_prekeys(user_id) WHERE NOT used;
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_evc_user_id ON email_verification_codes(user_id);

-- Default server settings
INSERT INTO server_settings (key, value) VALUES
    ('registration_open', 'true'),
    ('max_file_size_mb', '50'),
    ('default_message_ttl_seconds', '3600'),
    ('max_message_ttl_seconds', '86400'),
    ('server_name', 'WindChat'),
    ('maintenance_mode', 'false'),
    ('max_storage_kb', '1024'),
    ('require_email', 'false'),
    ('require_totp', 'false')
ON CONFLICT (key) DO NOTHING;

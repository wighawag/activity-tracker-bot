CREATE TABLE IF NOT EXISTS user_activity (
    user_id         TEXT PRIMARY KEY,
    guild_id        TEXT NOT NULL,
    last_message_at INTEGER NOT NULL,
    user_role       TEXT NOT NULL DEFAULT 'active',
    warned_at       INTEGER,
    warn_type       TEXT
);

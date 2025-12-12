CREATE TABLE IF NOT EXISTS user_activity (
    user_id         TEXT PRIMARY KEY,
    guild_id        TEXT NOT NULL,
    last_message_at INTEGER NOT NULL,
    has_role        INTEGER NOT NULL DEFAULT 0,
    warned_at       INTEGER,
    warn_type       TEXT
);

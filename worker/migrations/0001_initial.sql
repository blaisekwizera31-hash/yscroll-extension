PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  avatar_url TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS usage_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  time_saved_seconds INTEGER NOT NULL DEFAULT 0,
  time_scrolled_seconds INTEGER NOT NULL DEFAULT 0,
  UNIQUE (user_id, date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_usage_stats_saved
  ON usage_stats(time_saved_seconds DESC);
CREATE INDEX IF NOT EXISTS idx_usage_stats_user_date
  ON usage_stats(user_id, date);

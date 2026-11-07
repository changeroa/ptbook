CREATE TABLE IF NOT EXISTS ptbook_day_state (
  subject TEXT NOT NULL,
  day TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 0),
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (subject, day)
);

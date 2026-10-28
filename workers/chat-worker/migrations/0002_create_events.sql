-- First party funnel events (POST /event + lead_submitted written by /lead).
-- No IP, no user agent: only what the funnel queries in queries/funnel.sql need.
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('visit', 'cta_click', 'lead_submitted')),
  cta_id TEXT,                        -- cta_click: primary, cases, botardo, ...
  position TEXT,                      -- cta_click: hero, cases, final, dock, ...
  origin TEXT,                        -- lead_submitted: form | botardo
  visitor_id TEXT,
  visitor_type TEXT CHECK (visitor_type IN ('new', 'returning')),
  lang TEXT,
  path TEXT,
  created_at TEXT NOT NULL            -- ISO 8601 UTC
);

CREATE INDEX IF NOT EXISTS idx_events_type_created ON events (type, created_at);
CREATE INDEX IF NOT EXISTS idx_events_visitor ON events (visitor_id);

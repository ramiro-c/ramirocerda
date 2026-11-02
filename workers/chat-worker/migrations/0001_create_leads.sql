-- Contact form leads (POST /lead). One row per verified submission.
-- Apply: pnpm exec wrangler d1 migrations apply ramirocerda-leads --remote
CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,                -- crypto.randomUUID()
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  message TEXT NOT NULL,
  origin TEXT NOT NULL CHECK (origin IN ('form', 'botardo')),
  visitor_id TEXT,                    -- anonymous localStorage id, nullable
  lang TEXT NOT NULL CHECK (lang IN ('es', 'en')),
  user_agent TEXT,
  created_at TEXT NOT NULL            -- ISO 8601 UTC
);

CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads (created_at);
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads (email);

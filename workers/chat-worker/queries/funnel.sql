-- Conversion funnel over the last 30 days.
-- Run: pnpm exec wrangler d1 execute ramirocerda-leads --remote --file=queries/funnel.sql
-- (read only; each SELECT prints its own table)

-- 1. Clicks per CTA and placement.
SELECT cta_id, position, COUNT(*) AS clicks, COUNT(DISTINCT visitor_id) AS visitors
FROM events
WHERE type = 'cta_click' AND created_at >= datetime('now', '-30 days')
GROUP BY cta_id, position
ORDER BY clicks DESC;

-- 2. Leads per origin (form vs botardo), from the leads table itself.
SELECT origin, COUNT(*) AS leads
FROM leads
WHERE created_at >= datetime('now', '-30 days')
GROUP BY origin
ORDER BY leads DESC;

-- 3. Conversion new vs returning: visitors with a session vs visitors with a lead.
SELECT
  v.visitor_type,
  v.visitors,
  COALESCE(l.converted, 0) AS converted,
  ROUND(100.0 * COALESCE(l.converted, 0) / v.visitors, 2) AS conversion_pct
FROM (
  SELECT visitor_type, COUNT(DISTINCT visitor_id) AS visitors
  FROM events
  WHERE type = 'visit' AND visitor_type IS NOT NULL AND created_at >= datetime('now', '-30 days')
  GROUP BY visitor_type
) AS v
LEFT JOIN (
  SELECT visitor_type, COUNT(DISTINCT visitor_id) AS converted
  FROM events
  WHERE type = 'lead_submitted' AND visitor_type IS NOT NULL AND created_at >= datetime('now', '-30 days')
  GROUP BY visitor_type
) AS l ON l.visitor_type = v.visitor_type;

-- 4. Primary CTA click through per placement (clicks / visitors who had a session).
SELECT
  e.position,
  COUNT(DISTINCT e.visitor_id) AS clickers,
  (SELECT COUNT(DISTINCT visitor_id) FROM events WHERE type = 'visit' AND created_at >= datetime('now', '-30 days')) AS visitors
FROM events AS e
WHERE e.type = 'cta_click' AND e.cta_id = 'primary' AND e.created_at >= datetime('now', '-30 days')
GROUP BY e.position
ORDER BY clickers DESC;

-- The investing quote moved from a standalone `show_quotes` toggle to a
-- reorderable/hideable homepage widget ("investing_quote"). Preserve intent for
-- users who had previously turned quotes OFF by folding that into the widget's
-- hidden list, then drop the now-unused key.

-- 1. Users who had quotes off → hide the investing_quote widget (if not already).
UPDATE users
SET settings = jsonb_set(
  settings,
  '{homepage_widget_hidden}',
  COALESCE(settings->'homepage_widget_hidden', '[]'::jsonb) || '["investing_quote"]'::jsonb
)
WHERE settings->>'show_quotes' = 'false'
  AND NOT (COALESCE(settings->'homepage_widget_hidden', '[]'::jsonb) ? 'investing_quote');

-- 2. Remove the obsolete key for everyone (default is "shown").
UPDATE users
SET settings = settings - 'show_quotes'
WHERE settings ? 'show_quotes';

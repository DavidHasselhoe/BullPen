-- 151_washington_traders.sql
-- Widens the tracked roster from 18 congressional members to 29, adding the
-- most active profitable traders and four executive-branch officials.
--
-- WHY THE TABLES ARE STILL NAMED congress_*
-- -----------------------------------------
-- Four of the rows added here (Harris, Burgum, Wright, McMahon) are executive
-- branch, not Congress, so the table name is now slightly narrower than its
-- contents. Renaming congress_politicians / congress_trades / congress_holdings
-- would mean a new migration, three RLS policies, every query and every import
-- for zero reader-visible benefit. The user-facing surface is renamed instead
-- ("Washington Trading", /discover/politicians/[slug]). Same statute governs
-- both groups: executive financial disclosures fall under the Ethics in
-- Government Act and 5 U.S.C. 13107 exactly as congressional PTRs do, so the
-- public read gate from migration 149 needs no revisiting.
--
-- WHO IS DELIBERATELY ABSENT
-- --------------------------
-- Donald Trump (dc id 1587) is the largest filer in the dataset at 35,756
-- disclosed trades, and is excluded. Sampled live on 2026-09-23: 0 of 25 rows
-- carry a resolvable ticker. The assets are real equities (HOME DEPOT INC,
-- TEXAS INSTRS INC, BROADCOM INC) but the filing text is abbreviated in a way
-- the vendor's resolver never matched, so every row returns ticker 'N/A' and
-- his page would render empty. Resolving those descriptions to tickers
-- ourselves is fuzzy name matching, which is how a wrong ticker ends up
-- printed under a named public official. Revisit only if the vendor starts
-- resolving them.
--
-- JD Vance (dc id 1662) is excluded for the opposite reason: 1 disclosed
-- trade, 0 positions. Nothing to show.
--
-- Also skipped, all 0 positions and single-digit trades: Bessent, Lutnick,
-- Hegseth, Bondi, Pence.
--
-- SELECTION CRITERION, AND ITS SKEW
-- ---------------------------------
-- The seven congressional additions are the members with BOTH meaningful
-- volume (>100 disclosed trades) and positive annualised alpha. Ranking on
-- alpha alone is noise: the top of that leaderboard is Thomas Massie at 83%/yr
-- on two trades. Applying the volume floor happened to select seven
-- Republicans and no Democrats -- an artifact of the ranking, not a choice,
-- but it takes the roster to roughly 18R/11D and is written down here so it is
-- not mistaken for editorial intent later.
--
-- state and bioguide_id are left NULL for the new rows. The ingest backfills
-- them from the trades response, which already carries party/state/chamber at
-- no extra credit cost (see backfillMemberMeta in lib/congress/ingest-trades).
-- Headshots key off dc_politician_id, not bioguide_id, so they work regardless.

INSERT INTO public.congress_politicians
  (slug, dc_politician_id, display_name, party, chamber, sort_order) VALUES
  -- Active traders with positive risk-adjusted returns over real volume.
  ('dan-sullivan',        357, 'Dan Sullivan',        'R', 'Senate',    190),
  ('tim-moore',            54, 'Tim Moore',           'R', 'House',     200),
  ('roger-marshall',      229, 'Roger Marshall',      'R', 'Senate',    210),
  ('doug-lamborn',        407, 'Doug Lamborn',        'R', 'House',     220),
  ('peter-meijer',        297, 'Peter Meijer',        'R', 'House',     230),
  ('trey-hollingsworth',  418, 'Trey Hollingsworth',  'R', 'House',     240),
  ('sheri-biggs',           5, 'Sheri Biggs',         'R', 'House',     250),
  -- Executive branch, only those with enough disclosed activity to fill a page.
  ('kamala-harris',      1632, 'Kamala D. Harris',    'D', 'Executive', 260),
  ('chris-wright',       1672, 'Chris Wright',        NULL, 'Executive', 270),
  ('doug-burgum',        1667, 'Doug Burgum',         'R', 'Executive', 280),
  ('linda-mcmahon',      1622, 'Linda McMahon',       'R', 'Executive', 290)
ON CONFLICT (slug) DO NOTHING;

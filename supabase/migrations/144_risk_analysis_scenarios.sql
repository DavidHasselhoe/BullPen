-- Risk analyses run on a hypothetical book ("what if I added this built
-- portfolio?") rather than on what the user actually holds.
--
-- A scenario has to be told apart from a real analysis, because the feature
-- compares each run against the previous one: without this marker, the next
-- genuine analysis would diff against positions the user never bought and
-- report them as sold. Scenario rows are therefore excluded from the
-- prior-analysis lookup, from the saved history list, and from the keep-10
-- trim, and can still be opened directly by id.
--
-- The note doubles as the flag (NULL means a real analysis) and as the line
-- shown above the report saying what was added and how it was sized.

alter table public.risk_analyses
  add column if not exists scenario_note text;

comment on column public.risk_analyses.scenario_note is
  'Non-null marks a what-if run on a hypothetical portfolio. Text is shown above the report and keeps the row out of history and out of the previous-analysis comparison.';

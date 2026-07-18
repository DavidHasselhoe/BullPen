import type { ActivityHeatmapData, DayActivity } from '@/lib/github/commit-activity';

interface ActivityHeatmapProps {
  data: ActivityHeatmapData;
}

const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function tierFor(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count === 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  if (count <= 12) return 3;
  return 4;
}

function formatTooltip(day: DayActivity): string {
  const label = new Date(`${day.date}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
  if (day.count === 0) return `No commits on ${label}`;
  return `${day.count} commit${day.count === 1 ? '' : 's'} on ${label}`;
}

/** Groups the dense day list into Sun-Sat week columns, padding the first week with nulls before launch date. */
function buildWeeks(days: DayActivity[]): (DayActivity | null)[][] {
  if (days.length === 0) return [];
  const firstDayOfWeek = new Date(`${days[0].date}T00:00:00Z`).getUTCDay(); // 0=Sun
  const cells: (DayActivity | null)[] = [...(Array(firstDayOfWeek).fill(null) as null[]), ...days];

  const weeks: (DayActivity | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    const week = cells.slice(i, i + 7);
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }
  return weeks;
}

/** Returns a month label for the first week column that crosses into a new month, else null. */
function monthLabelsForWeeks(weeks: (DayActivity | null)[][]): (string | null)[] {
  let prevMonth: number | null = null;
  return weeks.map((week) => {
    const firstReal = week.find((d): d is DayActivity => d !== null);
    if (!firstReal) return null;
    const month = new Date(`${firstReal.date}T00:00:00Z`).getUTCMonth();
    if (month !== prevMonth) {
      prevMonth = month;
      return MONTH_LABELS[month];
    }
    return null;
  });
}

export function ActivityHeatmap({ data }: ActivityHeatmapProps) {
  const weeks = buildWeeks(data.days);
  if (weeks.length === 0) return null;

  const monthLabels = monthLabelsForWeeks(weeks);
  const summary = `Commit activity heatmap: ${data.totalCommits.toLocaleString()} commits across ${weeks.length} weeks since launch`;

  return (
    <div className="activity-heatmap">
      <p className="activity-heatmap-headline">
        <strong>{data.totalCommits.toLocaleString()}</strong> commits shipped since launch
      </p>
      <div className="activity-heatmap-scroll">
        <div className="activity-heatmap-inner">
          <div className="activity-heatmap-grid" role="img" aria-label={summary}>
            <div className="activity-heatmap-months">
              {monthLabels.map((label, i) => (
                <span key={i} className="activity-heatmap-month">
                  {label ?? ''}
                </span>
              ))}
            </div>
            <div className="activity-heatmap-body">
              <div className="activity-heatmap-daylabels">
                {DAY_LABELS.map((label, i) => (
                  <span key={i} className="activity-heatmap-daylabel">
                    {label}
                  </span>
                ))}
              </div>
              <div className="activity-heatmap-weeks">
                {weeks.map((week, wi) => (
                  <div className="activity-heatmap-week" key={wi}>
                    {week.map((day, di) =>
                      day ? (
                        <span
                          key={di}
                          className={`activity-heatmap-cell activity-heatmap-cell--${tierFor(day.count)}`}
                          title={formatTooltip(day)}
                        />
                      ) : (
                        <span key={di} className="activity-heatmap-cell activity-heatmap-cell--pad" aria-hidden="true" />
                      )
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="activity-heatmap-legend" aria-hidden="true">
            <span>Less</span>
            {([0, 1, 2, 3, 4] as const).map((tier) => (
              <span key={tier} className={`activity-heatmap-cell activity-heatmap-cell--${tier}`} />
            ))}
            <span>More</span>
          </div>
        </div>
      </div>
    </div>
  );
}

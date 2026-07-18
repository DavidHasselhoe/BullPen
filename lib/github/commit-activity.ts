const REPO = 'DavidHasselhoe/BullPen';
const LAUNCH_DATE = '2026-01-08';
const PER_PAGE = 100;
const MAX_PAGES = 20; // safety cap — 447 commits today is 5 pages; 20 pages covers years of growth

export interface DayActivity {
  /** YYYY-MM-DD, UTC calendar date. */
  date: string;
  count: number;
}

export interface ActivityHeatmapData {
  /** Dense list covering every calendar day from launchDate to today, zero-filled. */
  days: DayActivity[];
  totalCommits: number;
  launchDate: string;
}

interface GitHubCommitResponse {
  commit: {
    author: {
      date: string; // ISO 8601 UTC, e.g. "2026-07-18T14:23:01Z"
    } | null;
  };
}

async function fetchCommitPage(page: number): Promise<GitHubCommitResponse[]> {
  const url = `https://api.github.com/repos/${REPO}/commits?sha=preview&since=${LAUNCH_DATE}T00:00:00Z&per_page=${PER_PAGE}&page=${page}`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'bullpen-changelog-heatmap',
    },
    next: { revalidate: 86400 },
  });
  if (!res.ok) {
    throw new Error(`GitHub API responded ${res.status}`);
  }
  return (await res.json()) as GitHubCommitResponse[];
}

function buildDenseDayList(counts: Map<string, number>): DayActivity[] {
  const days: DayActivity[] = [];
  const cursor = new Date(`${LAUNCH_DATE}T00:00:00Z`);
  const today = new Date();
  const todayUTC = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  while (cursor.getTime() <= todayUTC.getTime()) {
    const dateStr = cursor.toISOString().slice(0, 10);
    days.push({ date: dateStr, count: counts.get(dateStr) ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return days;
}

export async function getCommitActivity(): Promise<ActivityHeatmapData | null> {
  try {
    const counts = new Map<string, number>();
    let totalCommits = 0;

    for (let page = 1; page <= MAX_PAGES; page++) {
      const commits = await fetchCommitPage(page);
      if (commits.length === 0) break;

      for (const c of commits) {
        const isoDate = c.commit.author?.date;
        if (!isoDate) continue;
        const day = isoDate.slice(0, 10);
        counts.set(day, (counts.get(day) ?? 0) + 1);
        totalCommits += 1;
      }

      if (commits.length < PER_PAGE) break;
    }

    if (totalCommits === 0) return null;

    return {
      days: buildDenseDayList(counts),
      totalCommits,
      launchDate: LAUNCH_DATE,
    };
  } catch {
    return null;
  }
}

import fs from 'fs';
import path from 'path';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/landing/Atoms';
import { Footer } from '@/components/landing/Footer';
import { getCommitActivity } from '@/lib/github/commit-activity';
import { ActivityHeatmap } from '@/components/changelog/ActivityHeatmap';
import '@/components/landing/landing-styles.css';

export const metadata: Metadata = {
  title: 'Changelog — BullPen',
  description: "What's new in BullPen — features, improvements, and fixes.",
};

type ChangelogEntryType = 'new' | 'improved' | 'fixed';

interface ChangelogEntry {
  type: ChangelogEntryType;
  text: string;
}

interface ChangelogDateGroup {
  date: string;
  entries: ChangelogEntry[];
}

const PILL_LABEL: Record<ChangelogEntryType, string> = {
  new: 'New',
  improved: 'Improved',
  fixed: 'Fixed',
};

function readChangelog(): ChangelogDateGroup[] {
  const filePath = path.join(process.cwd(), 'content', 'changelog.json');
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as ChangelogDateGroup[];
}

function formatDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export default async function ChangelogPage() {
  const groups = readChangelog();
  const activity = await getCommitActivity();

  return (
    <div className="bullpen-landing-root">
      <div className="content-layer">
        <header style={{ borderBottom: '1px solid var(--border)', padding: '20px 0' }}>
          <div className="wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Link href="/">
              <Logo size="sm" />
            </Link>
            <Link href="/" style={{ fontSize: 14, color: 'var(--fg-muted)' }}>
              ← Back to home
            </Link>
          </div>
        </header>

        <main className="wrap" style={{ padding: '56px 0 96px' }}>
          <h1 style={{ fontSize: 32, marginBottom: 8 }}>Changelog</h1>
          <p style={{ color: 'var(--fg-muted)', marginBottom: 48 }}>
            What&apos;s new, improved, and fixed in BullPen.
          </p>

          {activity && <ActivityHeatmap data={activity} />}

          <div className="changelog-list">
            {groups.map((group) => (
              <div className="changelog-date-group" key={group.date}>
                <div className="changelog-date">{formatDate(group.date)}</div>
                <div className="changelog-items">
                  {group.entries.map((entry, i) => (
                    <div className="changelog-item" key={i}>
                      <span className={`changelog-pill changelog-pill--${entry.type}`}>
                        {PILL_LABEL[entry.type]}
                      </span>
                      <span>{entry.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </main>

        <Footer />
      </div>
    </div>
  );
}

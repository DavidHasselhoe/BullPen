import fs from 'fs';
import path from 'path';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/landing/Atoms';
import { Footer } from '@/components/landing/Footer';
import { PageMascot } from '@/components/legal/PageMascot';
import '@/components/landing/landing-styles.css';

export const metadata: Metadata = {
  title: 'Roadmap',
  description: "Where BullPen has been, and what's next.",
};

interface HistoryEntry {
  date: string;
  text: string;
}

interface MonthGroup {
  date: string;
  items: string[];
}

function readRoadmapHistory(): HistoryEntry[] {
  const filePath = path.join(process.cwd(), 'content', 'roadmap.json');
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as HistoryEntry[];
}

// Entries for the same month are already adjacent in content/roadmap.json,
// so a simple consecutive-run grouping is enough — no need to re-sort.
function groupByMonth(history: HistoryEntry[]): MonthGroup[] {
  const groups: MonthGroup[] = [];
  for (const entry of history) {
    const last = groups[groups.length - 1];
    if (last && last.date === entry.date) {
      last.items.push(entry.text);
    } else {
      groups.push({ date: entry.date, items: [entry.text] });
    }
  }
  return groups;
}

function formatMonth(isoMonth: string): string {
  return new Date(`${isoMonth}-01T00:00:00Z`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}

export default function RoadmapPage() {
  const groups = groupByMonth(readRoadmapHistory());

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
          <PageMascot pose="thinking" className="mb-3" />
          <h1 style={{ fontSize: 32, marginBottom: 8 }}>Roadmap</h1>
          <p style={{ color: 'var(--fg-muted)', marginBottom: 16 }}>Where we&apos;ve been, and what&apos;s next.</p>

          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: '20px 24px',
              marginBottom: 48,
              maxWidth: 640,
              marginLeft: 'auto',
              marginRight: 'auto',
              background: 'var(--bg-2)',
            }}
          >
            <strong>What&apos;s next</strong>
            <p style={{ color: 'var(--fg-muted)', margin: '8px 0 0' }}>
              We&apos;re still scoping the public roadmap — check back soon.
            </p>
          </div>

          <div className="changelog-list">
            {groups.map((group) => (
              <div className="changelog-date-group" key={group.date}>
                <div className="changelog-date">{formatMonth(group.date)}</div>
                <div className="changelog-items">
                  {group.items.map((text, i) => (
                    <div className="changelog-item" key={i}>
                      <span className="changelog-pill changelog-pill--new">Shipped</span>
                      <span>{text}</span>
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

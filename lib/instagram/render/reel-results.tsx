/**
 * Saturday's earnings results as a Reel: the tally as the hook, every logo
 * ticking in with its check or cross (beats first, the misses last, so the
 * grid lands on them), one scene per miss (up to three, biggest first) with
 * the actual and expected profit per share, then why a beat is normal.
 *
 * Same engine, timeline and sound as the deep dive (reel.tsx): narration from
 * fixed templates over the post's own numbers, never a model.
 */
import type { EarningsResultCompany, EarningsResultsSlides } from '@/lib/instagram/content/schema';
import { displayCompanyName } from '@/lib/market-data/company-name';
import { ON_INK, ON_INK_MUTED, BRAND, LOSS, InkLogo, ResultMark, formatEps } from './slides';
import { Kicker, Plain, FollowBlock, prog, lerp, speakEps, speakPerShare, TRACK, type Beat, type El, type Sfx } from './reel';

const MAX_MISS_SCENES = 3;
const byCap = (a: EarningsResultCompany, b: EarningsResultCompany) => (b.marketCap ?? 0) - (a.marketCap ?? 0);

/** Reveal order: beats, then misses, each biggest first. */
function revealOrder(s: EarningsResultsSlides): EarningsResultCompany[] {
  return [...s.companies.filter((c) => c.status === 'beat').sort(byCap), ...s.companies.filter((c) => c.status === 'missed').sort(byCap)];
}

export function resultsHook(s: EarningsResultsSlides): [string, string] {
  const n = s.companies.length;
  return [`${s.beatCount} of ${n} beat the forecast.`, s.missedCount > 0 ? 'So who missed?' : 'Not one missed.'];
}

function HookBeat({ s, t }: { s: EarningsResultsSlides; t: number }): El {
  const [a, b] = resultsHook(s);
  const p = prog(t, 0.6, 0.45); // fixed, so the cover frame shows both lines
  const kicker = s.overflowCount > 0 ? `${s.companies.length} of ${s.companies.length + s.overflowCount} reports this week` : "This week's earnings";
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 48 }}>
      <Kicker text={kicker} />
      <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: 120, lineHeight: 1.02, letterSpacing: '-0.04em', color: ON_INK }}>{a}</span>
      <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: 120, lineHeight: 1.02, letterSpacing: '-0.04em', color: s.missedCount > 0 ? LOSS : BRAND, opacity: p, transform: `translateY(${lerp(40, 0, p)}px)` }}>{b}</span>
    </div>
  );
}

// ── The grid ────────────────────────────────────────────────────────────────

const GRID_START = 0.4;
/** Seconds between logos: quick enough that 24 fit in about three seconds. */
const step = (n: number) => Math.min(0.16, 3 / n);

function GridBeat({ order, t }: { order: EarningsResultCompany[]; t: number }): El {
  const n = order.length;
  const cols = n <= 9 ? 3 : n <= 16 ? 4 : 5;
  const rows = Math.ceil(n / cols);
  const gap = 34;
  const cell = Math.floor((TRACK - (cols - 1) * gap) / cols);
  const logo = Math.min(cell - 12, Math.floor(860 / rows) - 70);
  const shown = (i: number) => prog(t, GRID_START + i * step(n), 0.25);
  const revealed = order.filter((_, i) => t >= GRID_START + i * step(n) + 0.12);
  const beat = revealed.filter((c) => c.status === 'beat').length;
  const missed = revealed.length - beat;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 50 }}>
      <div style={{ display: 'flex', gap: 40, fontFamily: 'Geist', fontWeight: 700, fontSize: 88, letterSpacing: '-0.04em', lineHeight: 1 }}>
        <span style={{ display: 'flex', color: BRAND }}>{`${beat} beat`}</span>
        <span style={{ display: 'flex', color: missed > 0 ? LOSS : ON_INK_MUTED }}>{`${missed} missed`}</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', width: TRACK, columnGap: gap, rowGap: 26 }}>
        {order.map((c, i) => {
          const p = shown(i);
          const mark = prog(t, GRID_START + i * step(n) + 0.12, 0.2);
          return (
            <div key={c.symbol} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, width: cell, opacity: p, transform: `scale(${lerp(0.6, 1, p)})` }}>
              <div style={{ display: 'flex', position: 'relative' }}>
                <InkLogo symbol={c.symbol} logoUrl={c.logoUrl} size={logo} ring={mark > 0 ? (c.status === 'beat' ? BRAND : LOSS) : undefined} />
                <div style={{ display: 'flex', position: 'absolute', right: -6, bottom: -6, opacity: mark, transform: `scale(${lerp(0.4, 1, mark)})` }}>
                  <ResultMark status={c.status} size={Math.round(logo * 0.36)} />
                </div>
              </div>
              <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: Math.max(24, Math.min(30, Math.round(logo * 0.22))), color: ON_INK_MUTED }}>{c.symbol}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── A miss, up close ────────────────────────────────────────────────────────

function MissBeat({ c, first, t, cue }: { c: EarningsResultCompany; first: boolean; t: number; cue: number }): El {
  const p = prog(t, cue, 0.4);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 34 }}>
      <Kicker text={first ? 'Who missed' : 'Also missed'} color={LOSS} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 40 }}>
        <InkLogo symbol={c.symbol} logoUrl={c.logoUrl} size={190} ring={LOSS} />
        <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: 84, lineHeight: 1.02, letterSpacing: '-0.04em', color: ON_INK, width: TRACK - 230 }}>{displayCompanyName(c.name, c.symbol)}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 30 }}>
        <Plain text="Profit per share" />
        <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: 170, lineHeight: 1, letterSpacing: '-0.05em', color: LOSS, opacity: p, transform: `translateY(${lerp(30, 0, p)}px)` }}>{formatEps(c.epsActual)}</span>
        <Plain text={`Analysts expected ${formatEps(c.epsEstimate)}`} size={48} color={ON_INK} opacity={prog(t, cue + 0.4, 0.4)} />
      </div>
    </div>
  );
}

// ── Why it matters + follow ─────────────────────────────────────────────────

function LessonBeat({ t, cue }: { t: number; cue: number }): El {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
      <Kicker text="Good to know" />
      <span style={{ display: 'flex', fontFamily: 'Geist', fontWeight: 700, fontSize: 104, lineHeight: 1.04, letterSpacing: '-0.04em', color: ON_INK }}>Beating is normal.</span>
      <Plain text="Forecasts tend to sit a little low, so a miss is the bigger news." size={52} color={ON_INK} />
      <FollowBlock opacity={prog(t, cue, 0.5)} />
    </div>
  );
}

// ── Timeline ────────────────────────────────────────────────────────────────

export function resultsReelBeats(s: EarningsResultsSlides): Beat[] {
  const order = revealOrder(s);
  const n = order.length;
  const b = resultsHook(s)[1];
  const tally = s.overflowCount > 0
    ? `${s.beatCount} of the ${n} companies we tracked this week beat the forecast.`
    : `${s.beatCount} of ${n} companies beat the forecast this week.`;
  const beats: Beat[] = [{
    minDur: 2.6, say: `${tally} ${b}`, cueAt: 0.6,
    sfx: () => [],
    render: (t) => <HookBeat s={s} t={t} />,
  }];

  // One tick roll per 1.2 s of reveal (the roll's length), and a pop as the first miss lands.
  const revealEnd = GRID_START + n * step(n);
  const firstMiss = order.findIndex((c) => c.status === 'missed');
  beats.push({
    minDur: revealEnd + 1.4,
    say: 'Here is every one, profit per share against the forecast.',
    cueAt: 0,
    sfx: () => [
      ...Array.from({ length: Math.ceil((revealEnd - GRID_START) / 1.2) }, (_, k): [Sfx, number] => ['tick', GRID_START + k * 1.2]),
      ...(firstMiss >= 0 ? [['hit', GRID_START + firstMiss * step(n) + 0.12] as [Sfx, number]] : []),
    ],
    render: (t) => <GridBeat order={order} t={t} />,
  });

  order.filter((c) => c.status === 'missed').slice(0, MAX_MISS_SCENES).forEach((c, i) => {
    beats.push({
      minDur: 3.0,
      say: `${displayCompanyName(c.name, c.symbol)} ${c.epsActual < 0 ? `lost ^${speakPerShare(c.epsActual)}` : `earned ^${speakPerShare(c.epsActual)}`} a share. Analysts expected ${speakEps(c.epsEstimate)}.`,
      cueAt: 0.9,
      sfx: (cue) => [['pop', cue]],
      render: (t, cue) => <MissBeat c={c} first={i === 0} t={t} cue={cue} />,
    });
  });

  beats.push({
    minDur: 4.6,
    say: 'Good to know: beating is normal. Forecasts tend to sit a little low, so a miss is the bigger news. ^Follow for earnings in plain English.',
    cueAt: 2.4,
    sfx: (cue) => [['pop', cue]],
    render: (t, cue) => <LessonBeat t={t} cue={cue} />,
  });
  return beats;
}

export const resultsReelLabel = (s: EarningsResultsSlides) => `Earnings · ${s.weekLabel}`;
export const RESULTS_FOOTER = 'Not financial advice. Profit per share vs the analyst average.';

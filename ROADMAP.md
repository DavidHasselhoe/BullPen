# Roadmap

Living notes from an ongoing roadmap conversation. No fixed dates — David has no fixed timeframe in mind yet, so phases below are sequencing logic, not deadlines. Revisit and edit this as priorities shift.

## Personal goals (stated, confirmed)

- **Publish an iOS and Android app — iOS first.** Reasoning: iOS tends to convert/monetize better for subscription apps, and return feels stronger there.
- **Hire/commission a designer or animator** for custom illustration and motion for different in-app states/actions (beyond the current line-art bull mascot set).
- **Upgrade the market data provider once revenue covers the monthly cost** — more API credits/minute, better data quality, unlocks new features. (TwelveData Venture's next tier is 1,597 or 2,584 credits/min — this is a plan change, not a migration, so it's ready whenever the revenue trigger hits.)

## Discussion so far (2026-07-16)

### On "iOS first"
Good instinct on monetization. Worth deciding explicitly, though: **"iOS app" doesn't have to mean a React Native rewrite on day one.** Wrapping the existing web app in a Capacitor shell can get a real App Store listing shipped in weeks, testing actual mobile demand before investing in a native rewrite. If it takes off, rewrite properly; if not, the cost of finding out was small. This is flagged as the biggest open sequencing decision — see "Open decisions" below.

### On the designer/animator hire
Suggested sequencing this *with* mobile launch prep rather than before it — App Store screenshots, marketing refresh, and onboarding polish are all needed at once for a launch, so one commissioned push timed to that gets more value than doing it in isolation now.

### On the data provider upgrade
No changes to the plan — it's self-scheduling on revenue. Noted for reference: next TwelveData tier is a config change (1,597 or 2,584 credits/min), not an engineering project.

### Additional goals suggested (not yet prioritized)

- **Tighten the retention loop before mobile.** Mobile only pays off if people already come back daily on web. Daily Brief, streaks, and alerts exist — making that loop tighter (push-worthy moments, not just email) is likely higher leverage right now than starting mobile work.
- **Shareability as a growth lever.** Theses, health scores, and portfolio performance aren't shareable as cards/images today. Normally a cheap, compounding growth channel (someone shares a take, it drives a signup) — worth having before spending on paid channels or a designer.
- **Push notifications.** The alert logic already exists (price/earnings/daily brief via email); push is the mobile-native version and is what makes an installed app feel worth keeping versus just using the site in a browser. Natural to bundle with the mobile phase rather than build separately.
- **A Nordic wedge, given David is based in Norway.** SnapTrade covers North American brokerages well but nothing here talks to Nordnet, DNB, or other Nordic brokers, and there's no Norwegian localization despite `i18n` (react-i18next) already being wired into the codebase. Low-competition angle for early traction/press in the home market — worth scoping even if not built soon.
- **Compliance cleanup before app store submission, not during.** The AI terms consent gate (shipped this session) uses placeholder legal copy pending an actual lawyer review — needs to happen before this goes in front of Apple/Google's financial-app reviewers, since fixing it mid-rejection is far more expensive than fixing it now.
- **A thin layer of automated tests for money/trust-critical paths** — auth, billing, the AI terms gate. There's currently no test framework at all (one-off scripts via `tsx` only, per CLAUDE.md). Fine solo on one platform; riskier once shipping to two app stores where "check it in the browser" before every release doesn't scale.

### Rough phasing (sequencing, not dates)

1. **Now / near-term:** tighten the retention loop, ship shareability, close out the AI terms legal review.
2. **Next couple months:** Capacitor-wrapped iOS MVP + push notifications, timed with a designer engagement for launch assets.
3. **Once iOS proves out:** Android, and a real decision point on native rewrite vs. keep the wrapper.
4. **Revenue-triggered, whenever it hits:** data provider upgrade.
5. **Whenever it fits:** Nordic broker integration + localization as a differentiation bet.

## Open decisions

- **Capacitor/PWA-wrapper vs. full React Native rewrite for the first mobile release.** Biggest schedule-risk call in this roadmap — flagged for deeper discussion.
- Exact timing/ordering of the designer hire relative to mobile launch.
- Whether Nordic broker integration is worth prioritizing before or after Android.

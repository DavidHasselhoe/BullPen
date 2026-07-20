# Product

## Register

product

## Platform

web

## Users

Self-directed beginner-to-intermediate investors who research stocks and track a portfolio but don't have professional trading backgrounds. They come to BullPen wanting real market data — not a dumbed-down toy version of it — translated into language they can actually act on. Many are actively managing real money (via SnapTrade-linked brokerage accounts or manually tracked holdings) alongside crypto and commodity positions, so the product spans asset classes rather than assuming stocks-only.

## Product Purpose

BullPen is an all-in-one research and portfolio tool: live market data, AI-generated explanations of price moves and daily conditions, SEC filing analysis, and light social features (theses, profiles) — built specifically for people who aren't professional investors. Success isn't a single successful lookup; it's the product becoming a daily habit. The Daily Brief, price/earnings alerts, and Discover feed exist to pull users back every day so BullPen becomes their default financial check-in, not a tool they open only when something goes wrong.

## Positioning

Institutional-grade market data and AI-generated explanations, translated so a beginner isn't lost — the depth of a professional terminal without the jargon wall of Bloomberg or the bare, unexplained numbers of a typical brokerage app.

## Brand Personality

Confident, clear, modern. Sharp and premium-feeling — closer to a well-designed fintech product than a friendly consumer toy — but never intimidating. The existing landing identity (dark theme, emerald accent, Instrument Serif display type against Geist sans/mono) is the reference point: it reads as capable and current, not corporate-safe or gamified.

## Anti-references

Bloomberg-terminal density: dense, cryptic, jargon-heavy screens that assume professional training and bury the number a beginner actually needs to find. Every surface should favor clarity over showing-all-the-data-at-once, even when the underlying data is just as deep.

## Design Principles

Plain language over jargon — every metric ships with a beginner-friendly explanation (the `TermTooltip` + glossary pattern already in the codebase) rather than assuming the user already knows what P/E or EV/EBITDA means.

Confident, not intimidating — premium and sharp in execution, but never gatekeeping. If a design choice would make a first-time investor feel out of their depth, it's wrong even if it looks more "professional."

One consistent surface across asset classes — stocks, ETFs, crypto, and commodities share the same research model and visual language (per the asset-type system in `lib/assets/`), so users never have to relearn the UI when they move between asset types.

Explain, don't just report — AI features (Why Today?, Daily Brief, BullPen AI chat) exist to turn raw data into understanding, not just surface more numbers. Prefer an explanation over a metric when the two compete for space.

Design for return visits — daily habit is the north star, not the single session. Freshness cues, loading states, and daily rituals (Daily Brief, alerts) deserve as much design attention as the core data views.

## Accessibility & Inclusion

WCAG AA contrast across the app. Gains/losses must never rely on red/green alone — pair color with icons, labels, or directional indicators (▲/▼, "+"/"−") since red-green colorblindness is common among traders. Respect `prefers-reduced-motion` (already implemented globally in `app/globals.css`) for all new motion work.

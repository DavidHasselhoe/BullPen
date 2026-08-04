# Landing page screenshots

Drop real captures of the app here and the "A peek inside" section on the
landing page picks them up automatically. Nothing else needs to change.

The section probes for each file on mount and **silently skips any that are
missing** — if none are present the whole section is omitted rather than
rendering an empty frame. So it is safe to add them one at a time.

## Expected files

| File | Route to capture | Tab label |
|---|---|---|
| `dashboard.png` | `/dashboard` | Dashboard |
| `stock-detail.png` | `/stock/AAPL` | Stock detail |
| `ai-chat.png` | `/tools/ai-chat` | BullPen AI |
| `screener.png` | `/tools/screener` | Screener |
| `holdings.png` | `/holdings` | Holdings |

If you only want some of them, just add those. The tab strip hides itself when
there is only one shot.

## Capture settings

- **Viewport `1600 x 1000`**, device pixel ratio 2 if you can (the component
  declares `1600x1000`, so matching the aspect ratio avoids letterboxing).
- **Dark theme.** The landing page is dark-only and a light screenshot will
  glare against it.
- Capture the **content area only** — the component draws its own browser
  chrome (traffic lights + URL bar), so a shot that includes a real browser
  frame will look doubled.
- Let live data finish loading first. Empty skeletons photograph badly.

## Before you commit a capture

These ship publicly to every visitor, so check each one for:

- Real account balances or position sizes you would rather not publish
- Your email address, display name or avatar in the nav
- Anything in a notification tray or daily brief that names a real person

Using a demo account with plausible-but-not-personal holdings is the easiest
way to avoid all of the above.

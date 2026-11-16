# Marketing assets

Decks, one-pagers, slides, and copy. Name files `YYYY-MM-DD-short-name.ext`.

## Assets

| Asset | Source | Live |
|---|---|---|
| Pitch deck (7 slides: cover, problem, market, example Case Chat, students, teachers, close; indigo brand, Outfit + Geist) | `pitch-deck/project/` (one HTML file per slide + `deck.json`; images are artifact assets) | https://claude.ai/artifact/XTxRDK4A9StesD7HFvUweb (private until shared) |
| Logo: "dalaa" indigo dialogue (current, 2026-10-03) | `brand/2026-10-03-dalaa-indigo-dialogue-logo.png` (original); app-ready files in `public/brand/` | In the app (favicon, icons) |
| Logo candidate: "dala learning" dots (2026-11-16): black rounded-square chat mark with two dots and an indigo corner; "dala" in heavy black, "learning" in grey below | `brand/2026-11-16-dala-learning-dots-logo.png` (437×208 PNG, from Nathan) | Not used. Candidate only; note the "dala" spelling (S-006b) |
| Wordmark candidate: "dalaa" teal parrot (superseded) | `brand/2026-09-30-dalaa-teal-parrot-wordmark.png` | Not final — name undecided (strategy S-006) |

## Logo usage (indigo dialogue)

| Token | Hex | Use |
|---|---|---|
| Indigo | `#404DF6` | The mark; primary buttons (white text 5.8:1 — passes AA) |
| Indigo, dark mode | `#7C86FF` | The mark on dark backgrounds (6.0:1 on ink) |
| Ink | `#0D102A` | Wordmark; body text on light (18.7:1) |
| Ink, dark mode | `#F2F3FA` | Wordmark on dark |

Files in `public/brand/`: `dalaa-lockup.png` / `-dark.png` (mark + wordmark,
transparent), `dalaa-mark.png` / `-dark.png` (mark only). Browser icons
(`src/app/icon.png`, `apple-icon.png`, `favicon.ico`) use white-on-indigo tiles —
the bare mark's cut-out "d" fills in below ~24px.

**Still needed:** a true vector (SVG) master. These files are traced from a
1774×887 raster, fine on screen up to ~1100px wide but not for print or large
signage. Trademark/clearance check is #7.

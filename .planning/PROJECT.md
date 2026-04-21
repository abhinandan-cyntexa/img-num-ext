# Image + Number KPI Card Extension

## What This Is

A Tableau custom worksheet extension that renders a responsive KPI card grid inside a Tableau workbook. Each card displays a dynamic image (loaded from a URL field in the Tableau worksheet data) and a formatted number below it (from a Tableau measure field). Tableau authors drop the extension onto a worksheet, map an image-URL field and a measure field via encodings, and the extension renders as many cards as there are rows.

## Core Value

Each card must reliably show the correct image and correctly formatted number from live Tableau worksheet data — if the image-to-number pairing breaks or the number is wrong, the extension is useless.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Extension initializes via Tableau Extensions API v2 and reads worksheet summary data
- [ ] Each data row renders as one card: image on top, formatted number below
- [ ] Image source is a URL string from a Tableau data field (mapped via encoding)
- [ ] Number comes from a Tableau measure field (mapped via encoding)
- [ ] Numbers are auto-formatted with comma separators (e.g. 1,223,661)
- [ ] Cards lay out in an auto-responsive CSS grid (wraps to fill container width)
- [ ] Visual style matches Tableau's light theme (white background, neutral borders, system fonts)
- [ ] Extension reacts to worksheet filter/data changes (SummaryDataChanged event)
- [ ] .trex manifest file for local dev (pointing to localhost:8080)
- [ ] Broken/missing image URLs degrade gracefully (placeholder or hidden)

### Out of Scope

- Card label/title field — deferred, not required for v1
- Number abbreviation style (1.2M) — comma formatting sufficient for v1
- Static/hardcoded images — all images are dynamic from data
- D3 or external chart libraries — plain HTML/CSS/JS only
- Server-side component — pure static files, no backend

## Context

- Reference project at `/Users/abhinandansingh/Documents/cyntexa-dev/Tableau/Custom-Extensions/tableau-viz` uses the same structure: `index.html` + `chart.js` + `.trex` manifest + `-local.trex` for dev
- Reference extensions use `tableau.extensions.initializeAsync()`, `worksheet.getSummaryDataReaderAsync()`, `worksheet.getVisualSpecificationAsync()`, and `TableauEventType.SummaryDataChanged`
- Tableau Extensions API v2 is loaded via CDN: `https://extensions.tableau.com/lib/tableau.extensions.2.latest.js`
- Extension lives in `/Users/abhinandansingh/Documents/cyntexa-dev/Tableau/Custom-Extensions/img-num-ext/`
- Screenshot shows a "PictureThis Free"-style extension rendering one card with a people icon and number 1,223,661 — this is the target output shape, scaled to N cards

## Constraints

- **Tech Stack**: Plain HTML/CSS/JS only — no build tools, no npm, no D3, no React
- **API Version**: Tableau Extensions API v2 (CDN)
- **Hosting**: Static files served via local HTTP server (e.g. `python -m http.server 8080`) for dev
- **Compatibility**: Must work in Tableau Desktop (local dev via -local.trex)
- **Style**: Must match Tableau light theme — white cards, subtle borders, system fonts, no dark mode

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Use encodings for image + number fields | Consistent with reference project pattern; lets Tableau author map any field | — Pending |
| CSS Grid for layout | Native browser, no library needed, auto-responsive out of the box | — Pending |
| Comma-only number formatting | Simple, readable, no ambiguity vs. abbreviations (1.2M) | — Pending |
| No card label in v1 | User is unsure about label; defer to avoid over-building | — Pending |

---
*Last updated: 2026-04-21 after initialization*

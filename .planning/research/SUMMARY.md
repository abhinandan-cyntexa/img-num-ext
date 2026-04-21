# Research Summary: Image + Number KPI Card Extension

**Project:** Tableau Custom Worksheet Extension — KPI Card Grid
**Synthesized:** 2026-04-21

---

## Stack — What to Use and What to Avoid

**Use:**

| Technology | Decision |
|------------|----------|
| `tableau.extensions.2.latest.js` (CDN) | Only v2 has `getSummaryDataReaderAsync()` and `getVisualSpecificationAsync()` |
| Vanilla HTML5 + CSS3 + ES2020 JS | Hard project constraint; entirely sufficient |
| `index.html` + `extension.js` (two files) | Matches reference project pattern; no build step, no modules |
| CSS Grid `auto-fill` + `minmax(160px, 1fr)` | Correct responsive card layout primitive |
| `Intl.NumberFormat('en-US')` | Native comma-separated formatting |
| `python -m http.server 8080` | Fully sufficient local dev server |
| Two `.trex` files (`-local.trex` / `.trex`) | Separate manifests for dev (localhost) and prod URL |

**Avoid:**

| Technology | Reason |
|------------|--------|
| Tableau Extensions API v1 | Missing required v2-only methods |
| React / Vue / Angular / D3 | Hard project constraint; overkill |
| npm / webpack / Vite | No build toolchain per constraint |
| `file://` protocol | Tableau Desktop blocks Extensions API init on `file://` |
| `getSummaryDataAsync()` (v1 style) | Deprecated; use `getSummaryDataReaderAsync()` + `getAllPagesAsync()` |
| CSS `vw`/`vh` units | Unreliable inside Tableau's iframe |
| `crossorigin="anonymous"` on `<img>` | Makes images subject to CORS preflight |

---

## Table Stakes — Must-Have for v1

- **Encoding-based field mapping** — resolve image URL field and measure via `getVisualSpecificationAsync()`
- **One card per data row** — each summary data row = one card
- **Image above number** — vertical layout: image on top, formatted number below
- **Comma-separated number formatting** — `1,223,661` via `Intl.NumberFormat`; full value by default
- **Broken image graceful degradation** — `onerror` on every `<img>`; null/empty/`"Null"` URL guard
- **Image aspect ratio preserved** — `object-fit: contain` with fixed height container
- **Auto-responsive CSS Grid** — cards fill available width and wrap at natural breakpoints
- **Live data refresh** — `SummaryDataChanged` listener re-renders on filter; registered exactly once
- **Empty state** — neutral message when zero rows or unmapped encodings
- **No configuration required** — renders on first load without a Configure dialog

**Defer to v2+:** Config UI, label/title field, click-to-filter, abbreviation toggle, prefix/suffix, decimal precision, threshold colors, dark mode, animation.

---

## Architecture — Key Components and Data Flow

**File structure:**
```
img-num-ext/
├── index.html              # Shell: card-container div, inline CSS, two script tags
├── extension.js            # All logic: init → encoding → data → render → events
├── img-num-ext-local.trex  # Dev manifest (localhost:8080)
└── img-num-ext.trex        # Prod manifest (add at deploy time)
```

**Data flow (5 phases):**

1. **Init** — `initializeAsync()` resolves; get worksheet; render once; register `SummaryDataChanged` once.
2. **Encoding read** — `getVisualSpecificationAsync()` returns `fieldCaption` for image shelf and measure shelf.
3. **Data read** — `getSummaryDataReaderAsync()` → `getAllPagesAsync()` → `DataTable`. Build `{ fieldCaption → columnIndex }` map. Never use positional index.
4. **Render** — loop rows, extract image URL and number, build card HTML strings, replace `container.innerHTML`.
5. **Refresh** — `SummaryDataChanged` re-runs phases 2–4. Guard concurrent renders with `rendering` flag. Always `releaseAsync()` in `finally`.

**Key `.trex` manifest rules:**
- Element must be `<worksheet-extension>` not `<dashboard-extension>`
- `min-api-version="2.1"`
- `<permission>full data</permission>` required for data access
- `<encoding id="image-url">` and `<encoding id="number-value">` — IDs must match JS lookups exactly

---

## Watch Out For — Top Critical Pitfalls

**1. DataReader Not Released (CRITICAL)**
Extension loads once then silently stops updating after filter interactions.
→ `await reader.releaseAsync()` in a `finally` block — no exceptions.

**2. SummaryDataChanged Listener Registered Multiple Times (CRITICAL)**
Each filter adds another handler; renders compound and cards flash.
→ Register listener exactly once inside `initializeAsync().then()`.

**3. Worksheet Access Before `initializeAsync` Resolves (CRITICAL)**
`worksheetContent` is `undefined` until the promise resolves.
→ Every worksheet access line must live inside the `await` chain.

**4. Encoding/Column Lookup by Array Index (CRITICAL)**
`row[0]` and `encodings[0]` break when author maps fields in different order.
→ Always look up column index by `fieldCaption` match.

**5. Null Values Not Guarded in 4 Forms (CRITICAL)**
`null`, `"Null"`, `""`, `0` all represent missing data from Tableau cells.
→ Guard all four in `parseUrl()` and `parseNumber()` helpers.

**6. .trex URL Must Be Exact (HIGH)**
`localhost` ≠ `127.0.0.1`; bare path may return directory listing.
→ Always use `http://localhost:8080/index.html` — explicit filename.

**7. CSS `vw`/`vh` Causes Horizontal Scrollbar (MODERATE)**
`100vw` includes iframe scrollbar width.
→ Use `width: 100%` and `overflow-x: hidden`; test inside Tableau Desktop.

**8. `Number(cell.formattedValue)` Double-Formats (MODERATE)**
Tableau's `formattedValue` already has locale formatting.
→ Use `Number(cell.value)` always, with `isNaN` guard.

---

## Build Order — Recommended Sequence

| Step | What to Build | Verification Gate |
|------|--------------|-------------------|
| 1 | `.trex` manifest + `index.html` with `<h1>Hello</h1>` | iframe loads in Tableau — manifest and dev server confirmed |
| 2 | `initializeAsync()` + `console.log(worksheet.name)` | Console shows worksheet name — API handshake confirmed |
| 3 | `getSummaryDataReaderAsync` + log first 3 rows + columns | Correct column names and raw values in console |
| 4 | `getVisualSpecificationAsync` + log encoding captions | Captions match column captions from Step 3 — field mapping confirmed |
| 5 | Render first row only as one card | Image loads, number comma-formatted, no NaN or broken icon |
| 6 | Render all rows + CSS Grid | All N cards, responsive wrap, correct sizing |
| 7 | `SummaryDataChanged` + `onerror` + null guards + `releaseAsync` | Cards update on filter; broken URLs degrade; no duplicate renders |

---

## Gaps to Validate Early (Steps 3–4)

- Exact property path of `marksSpecificationsByEncoding` — log full `visualSpec` before assuming key structure
- `fieldCaption` vs `fieldName` alignment between `getVisualSpecificationAsync()` and `DataTable.columns`
- Image URL reachability from Tableau Desktop's embedded Chromium — test with known public image URLs first

# Features Research: Image + Number KPI Card Extension

**Domain:** Tableau worksheet extension — KPI/metric card display with dynamic images
**Researched:** 2026-04-21

---

## Table Stakes

Features users expect. Absent = extension feels broken or incomplete.

### Data Binding

- **Image URL field read from Tableau encoding** — Users map any string dimension as the image source via the Marks > Image shelf. Implemented via `getVisualSpecificationAsync()` to resolve the mapped field name, then matched against `getSummaryDataReaderAsync()` columns. [complexity: med] [blocks everything else]

- **Measure field read from Tableau encoding** — Users map a SUM/COUNT/AGG measure to the Data/Size shelf. Extension must resolve this encoding programmatically, not by column index. [complexity: med]

- **One card per data row** — Each row in summary data = one rendered card. [complexity: low]

- **Live data refresh on filter/mark change** — Extension must listen to `TableauEventType.SummaryDataChanged` and re-render without a manual reload. [complexity: low]

### Number Display

- **Comma-separated integer formatting** — `1,223,661` not `1223661`. Implemented with `Intl.NumberFormat`. [complexity: low]

- **Display raw value, not truncated** — Full number by default; abbreviation is opt-in. [complexity: low]

### Image Rendering

- **Image rendered above the number** — Established KPI card visual hierarchy (confirmed by screenshot). [complexity: low]

- **Broken/missing image graceful degradation** — `onerror` handler on `<img>` that hides or replaces with neutral placeholder. [complexity: low]

- **Image aspect ratio preserved** — `object-fit: contain` with fixed container. [complexity: low]

### Layout

- **Auto-responsive CSS Grid** — `grid-template-columns: repeat(auto-fill, minmax(Xpx, 1fr))`. Cards fill available width and wrap automatically. [complexity: low]

- **Consistent card sizing** — Fixed-height card containers with `overflow: hidden`. [complexity: low]

- **Tableau light theme visual match** — White card background, subtle border, system font stack, no heavy shadows. [complexity: low]

### Initialization

- **Extension initializes without user configuration steps** — Renders on first load, no "Configure" step required. [complexity: low]

- **Handles zero-row data gracefully** — Neutral empty state, no crash. [complexity: low]

---

## Differentiators

Features that add value over the minimum — not v1.

- **Label/title field (third encoding)** — Text label per card (e.g., program name). Deferred in v1 per PROJECT.md. [complexity: med]
- **Tooltip field passthrough** — Hover tooltip matching Tableau's native style. [complexity: med]
- **Abbreviation formatting toggle (1.2M, 4.5K)** — `Intl.NumberFormat` compact notation. Opt-in, not default. [complexity: low once config UI exists]
- **Decimal precision control** — 0, 1, or 2 decimal places. [complexity: low once config UI exists]
- **Prefix/suffix support ($, %)** — Revenue or percentage KPIs. [complexity: low once config UI exists]
- **Configurable minimum card width** — Single CSS variable surfaced as config. [complexity: low]
- **Number color coding based on threshold** — Green/red conditional coloring. [complexity: med]
- **Click-to-filter** — `worksheet.selectMarksByValueAsync()` on card click. [complexity: high — fragile against aggregated data]

---

## Anti-Features (defer from v1)

- **Configuration UI / settings dialog** — Gates all differentiators; `displayDialogAsync` is non-trivial. Defer until core is validated.
- **Click-to-filter** — High complexity, fragile against aggregated summary data, risk of broken dashboard interactivity.
- **Dark mode / theme toggling** — Tableau Desktop is light-theme-primary; premature.
- **Number abbreviation as default** — Removes precision users of operational metrics need. Comma-formatting is the correct default.
- **Animation / transition on data refresh** — Requires card diffing; not expected in Tableau extension contexts.
- **Multiple worksheets / cross-sheet data** — Belongs in Tableau's data layer.
- **Export / download** — Tableau already has export.

---

## Data Field Mapping: Standard Pattern

| Encoding Shelf | Field Type | Purpose |
|----------------|-----------|---------|
| Image | String dimension — URL | Image source per card |
| Data / Size | Measure (AGG) | Number displayed per card |
| Detail | Dimension | Label/title (deferred v1) |
| Tooltip | Any | Hover content (deferred v1) |

The screenshot confirms: "Total Member Base I..." (image URL dimension) and "CNT(Loyalty Progra...)" (aggregate measure) as the two active field pills.

---

## Key Findings

- Table stakes are narrow and achievable: resolve two encodings, render cards, format numbers with commas, handle broken images, reflow on data change.
- Graceful degradation for broken images is a quality signal — broken-image glyphs in a production dashboard are immediately visible.
- Configuration UI (`displayDialogAsync`) is the unlock for most differentiators — validate core rendering first.
- `Intl.NumberFormat` covers comma-separated integers and compact abbreviations, making future toggle low-cost once config UI exists.
- The entire table-stakes feature set is achievable in plain HTML/CSS/JS with no build tooling.

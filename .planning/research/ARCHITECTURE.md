# Architecture Research: Image + Number KPI Card Extension

**Project:** Tableau Worksheet Extension — KPI Card Grid
**Researched:** 2026-04-21

---

## Component Overview

Three files. No build step, no bundler, no server-side component.

| Component | File | Responsibility |
|-----------|------|----------------|
| Shell | `index.html` | HTML skeleton, inline CSS for card grid, script tag wiring |
| Logic | `extension.js` | All JS: API init, data fetch, encoding read, render, event listener |
| Manifest (dev) | `img-num-ext-local.trex` | Dev manifest pointing to `http://localhost:8080` |
| Manifest (prod) | `img-num-ext.trex` | Production manifest (add when deploying) |

### Dependency Graph

```
Tableau Desktop
    └── loads .trex manifest
            └── iframes index.html (served by local HTTP server)
                    ├── <style> CSS (inline in index.html)
                    └── <script> loads:
                            ├── tableau.extensions.2.latest.js (CDN)
                            └── extension.js (local logic)
```

---

## Data Flow

### Phase 1 — Initialization

```
tableau.extensions.initializeAsync()
    → Promise resolves
    → extensions.worksheetContent.worksheet  (host worksheet object)
    → call fetchAndRender(worksheet)
    → register worksheet.addEventListener(TableauEventType.SummaryDataChanged, handler)
```

`initializeAsync()` must complete before any other API call. Worksheet extensions are always embedded in exactly one worksheet — no sheet selection needed.

### Phase 2 — Encoding Read (field mapping)

```
worksheet.getVisualSpecificationAsync()
    → visualSpec.marksSpecificationsByEncoding
        → keyed by encoding role name (matching .trex manifest encoding ids)
        → each value: array of MarksSpecification objects with .fieldCaption
    → imageCaption  = encodings["image-url"][0].fieldCaption
    → numberCaption = encodings["number-value"][0].fieldCaption
```

`fieldCaption` is the display name that also appears as a column header in `DataTable`. This is the join key between encoding shelf and data column.

### Phase 3 — Data Read

```
worksheet.getSummaryDataReaderAsync()
    → DataTableReader
    → dataTableReader.getAllPagesAsync()
    → DataTable
    → dataTable.columns[]  →  build { fieldName: columnIndex } map
    → dataTable.data[][]   →  DataValue.value per cell
    → dataTableReader.releaseAsync()   // ALWAYS release in finally block
```

Build the column index map from `dataTable.columns` using `fieldCaption` lookup — never rely on positional column order.

### Phase 4 — Render

```
for each row in dataTable.data:
    imageUrl      = row[imageIdx].value
    formattedNum  = formatNumber(row[numberIdx].value)
    → buildCardHTML(imageUrl, formattedNum)

container.innerHTML = cardHTMLStrings.join('')
```

Full `innerHTML` replace on every render — correct and imperceptible at small N.

### Phase 5 — Change Reaction

```
worksheet.addEventListener(
    TableauEventType.SummaryDataChanged,
    () => fetchAndRender(worksheet)
)
```

Re-runs the full fetch+render pipeline. Registered ONCE after `initializeAsync()`.

### Complete Data Flow Diagram

```
Tableau worksheet data
         │  getSummaryDataReaderAsync() → getAllPagesAsync()
         ▼
    DataTable
    ├── columns[]  →  fieldCaption lookup  →  { imageIdx, numberIdx }
    └── data[][]   →  DataValue.value per row
         │  for each row: extract imageUrl + rawNumber
         ▼
    Card HTML strings  →  container.innerHTML
         │
    CSS Grid  →  browser renders N cards
         │
    SummaryDataChanged
         └──► re-run from DataTable step
```

---

## File Structure

```
img-num-ext/
├── index.html              # Shell: HTML, inline CSS, script tags
├── extension.js            # Logic: init, data, render, events
├── img-num-ext-local.trex  # Dev manifest (localhost:8080)
└── img-num-ext.trex        # Prod manifest (add when deploying)
```

### index.html responsibilities
- Single `<div id="card-container">` as CSS Grid mount point
- Inline `<style>` with grid layout, card styles, image sizing, number styling
- Two `<script>` tags at end of `<body>`: CDN script first, then `extension.js`
- No other HTML — cards injected entirely by JS

### extension.js internal structure

```
initializeAsync entry point
    └── fetchAndRender(worksheet)
            ├── getEncodingCaptions(worksheet)   → { imageCaption, numberCaption }
            ├── getSummaryDataReaderAsync()       → DataTable
            ├── buildColumnIndex(columns, ...)   → { imageIdx, numberIdx }  [pure]
            ├── render loop → buildCardHTML()    [pure]
            └── container.innerHTML = result

formatNumber(value)     [pure] — Intl.NumberFormat('en-US')
buildCardHTML(url, num) [pure] — returns HTML string

addEventListener(SummaryDataChanged) — registered once after init
```

### .trex Manifest Structure

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest manifest-version="0.1" xmlns="http://www.tableau.com/xml/extension_manifest">
  <worksheet-extension id="com.cyntexa.img-num-ext" extension-version="1.0.0">
    <default-locale>en_US</default-locale>
    <name resource-id="name"/>
    <description resource-id="description"/>
    <author name="Cyntexa" email="amankaushik@cyntexa.com"
            organization="Cyntexa" website="https://cyntexa.com"/>
    <min-api-version>2.1</min-api-version>
    <source-location>
      <url>http://localhost:8080/index.html</url>
    </source-location>
    <icon><!-- base64 icon --></icon>
    <encoding id="image-url"
              allowed-field-data-types="string"
              allowed-field-role="dimension" />
    <encoding id="number-value"
              allowed-field-data-types="integer,float"
              allowed-field-role="measure" />
  </worksheet-extension>
  <resources>
    <resource id="name">
      <text locale="en_US">Image + Number KPI Cards</text>
    </resource>
    <resource id="description">
      <text locale="en_US">Responsive grid of KPI cards — image from URL field, number from measure field.</text>
    </resource>
  </resources>
</manifest>
```

**Critical:** encoding `id` values (`"image-url"`, `"number-value"`) must exactly match the keys used in `getVisualSpecificationAsync()` JS lookups.

---

## Key Architectural Decisions

### 1. Single JS file, no modules
No build tooling means no module bundler. One non-module JS file eliminates ES module MIME/path complexity. Organize by section comments within the file.

### 2. `getAllPagesAsync()` not paginated reads
KPI card extensions target small N (tens to low hundreds). Full buffer read is simpler. Paginated reads add complexity with no benefit here.

### 3. Full `innerHTML` replace, no DOM diffing
Simplest correct approach at small N. Images reload on data change but browser cache makes this imperceptible.

### 4. CSS Grid `auto-fill` + `minmax` for layout

```css
#card-container {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
  padding: 12px;
  width: 100%;
  overflow-y: auto;
  background: #ffffff;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  box-sizing: border-box;
}
.card {
  background: #ffffff;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 8px;
  gap: 8px;
}
.card img { width: 100%; height: 120px; object-fit: contain; }
.card .number { font-size: 1.1rem; font-weight: 600; color: #1a1a1a; text-align: center; }
```

One rule handles all widths. 160px minimum yields 4–5 cards per row in a typical 800px pane.

### 5. Encoding-based field mapping (not hardcoded column names)
`getVisualSpecificationAsync()` returns the fields the author mapped — works with any field name in any data source.

### 6. Column lookup by caption not by position
`dataTable.columns` order is not guaranteed stable. Build a `{ fieldCaption → columnIndex }` map and use it for every row.

---

## Build Order

Each step is verifiable in Tableau Desktop before proceeding.

| Step | What to Build | Verification Gate |
|------|--------------|-------------------|
| 1 | `.trex` manifest + `index.html` with `<h1>Hello</h1>` | Extension iframe loads in Tableau with hello text |
| 2 | `initializeAsync()` + `console.log(worksheet.name)` | Console shows worksheet name — API handshake confirmed |
| 3 | `getSummaryDataReaderAsync` + log first 3 rows + column captions | Correct column names and values in console |
| 4 | `getVisualSpecificationAsync` + log encoding captions | Logged captions match column captions from Step 3 |
| 5 | Render first row only as one card | Correct image loads, number formatted with commas |
| 6 | Render all rows + CSS Grid | All N cards, responsive layout, wraps correctly |
| 7 | `SummaryDataChanged` listener + broken image `onerror` | Cards update on filter; broken URL degrades gracefully |

---

## Risks and Gaps

| Area | Risk | Mitigation |
|------|------|------------|
| `marksSpecificationsByEncoding` property path | May differ from expected shape | Log entire `visualSpec` in Step 4, reconcile before Step 5 |
| `fieldCaption` vs `fieldName` | `columns[i].fieldName` may differ from encoding `.fieldCaption` | Log and compare both in Step 3+4 |
| Image CORS | External image URLs blocked in some corporate environments | Test with known CORS-open URLs; document requirement |
| Encoding not mapped | Author opens extension before mapping fields — null caption | Null-guard all encoding reads; show "Map fields" empty state |

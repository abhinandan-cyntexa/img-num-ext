# Requirements: Image + Number KPI Card Extension

**Defined:** 2026-04-21
**Core Value:** Each card must reliably show the correct image and correctly formatted number from live Tableau worksheet data.

---

## v1 Requirements

### Foundation

- [ ] **FOUND-01**: Extension initializes via Tableau Extensions API v2 (`initializeAsync()`) and obtains the host worksheet object
- [ ] **FOUND-02**: Extension renders on first load without any author configuration step
- [ ] **FOUND-03**: `.trex` manifest file is present and loads the extension in Tableau Desktop (`<worksheet-extension>`, `min-api-version="2.1"`, `full data` permission)
- [ ] **FOUND-04**: A `-local.trex` manifest variant points to `http://localhost:8080/index.html` for local development

### Data

- [ ] **DATA-01**: Extension reads summary data from the host worksheet using `getSummaryDataReaderAsync()` + `getAllPagesAsync()`; always releases reader via `releaseAsync()` in a `finally` block
- [ ] **DATA-02**: Extension reads encoding field mappings via `getVisualSpecificationAsync()` to identify which data column is the image URL field and which is the number field
- [ ] **DATA-03**: Column lookup uses field caption matching against `dataTable.columns` — never positional index
- [ ] **DATA-04**: Extension re-renders cards on `SummaryDataChanged` event; listener registered exactly once after `initializeAsync()`
- [ ] **DATA-05**: Null, empty string, `"Null"`, and `0` cell values are guarded before use (do not pass to `<img src>` or `Number()` directly)

### Cards

- [ ] **CARD-01**: Each data row renders as one card with image on top and formatted number below
- [ ] **CARD-02**: Image source is the URL string value from the mapped image encoding field
- [ ] **CARD-03**: Number is formatted with comma separators using `Intl.NumberFormat('en-US')` (e.g. `1,223,661`)
- [ ] **CARD-04**: Image renders with preserved aspect ratio (`object-fit: contain`, fixed height container)
- [ ] **CARD-05**: Broken or missing image URL degrades gracefully — `onerror` hides the image or shows a neutral placeholder; no browser broken-image glyph

### Layout

- [ ] **LAYOUT-01**: Cards lay out in an auto-responsive CSS Grid (`repeat(auto-fill, minmax(160px, 1fr))`); wraps automatically as container width changes
- [ ] **LAYOUT-02**: All cards are the same size regardless of image dimensions or number length
- [ ] **LAYOUT-03**: Visual style matches Tableau light theme: white card background, `1px solid #e0e0e0` border, `border-radius: 4px`, system font stack (`-apple-system, BlinkMacSystemFont, "Segoe UI"`)
- [ ] **LAYOUT-04**: Container uses `width: 100%` and `overflow-x: hidden`; no `vw`/`vh` units (unreliable inside Tableau iframe)

### States

- [ ] **STATE-01**: Extension shows a loading indicator while data is being fetched
- [ ] **STATE-02**: Extension shows a neutral empty state (not blank/broken) when the worksheet has zero rows or encoding fields are not yet mapped

---

## v2 Requirements

### Configuration UI

- **CONFIG-01**: Author can configure minimum card width via extension settings dialog
- **CONFIG-02**: Author can enable number abbreviation formatting (1.2M, 4.5K) as opt-in toggle
- **CONFIG-03**: Author can set number prefix/suffix (e.g. "$", "%")
- **CONFIG-04**: Author can set decimal precision (0, 1, or 2 places)

### Additional Fields

- **FIELD-01**: Extension supports an optional label/title field (third encoding shelf) displayed below the number per card
- **FIELD-02**: Extension supports tooltip field passthrough on card hover

### Interactions

- **INT-01**: Clicking a card selects the corresponding mark in the Tableau worksheet (click-to-filter via `selectMarksByValueAsync`)

### Visual

- **VIS-01**: Number color coding based on configurable threshold (green above, red below)

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| Static/hardcoded images | All images must be dynamic from data; no built-in icon library |
| D3 or external chart libraries | Hard constraint; plain HTML/CSS/JS only |
| Dark mode | Tableau Desktop is light-theme primary; premature |
| Animation on data refresh | Requires DOM diffing; not expected in Tableau extension contexts |
| Multi-sheet / cross-sheet data | Belongs in Tableau's data layer, not the extension |
| Export / download | Tableau already has export; redundant and adds enterprise review complexity |
| Backend / server-side component | Pure static files only |
| Number abbreviation as default | Removes precision users of operational metrics actively need |

---

## Traceability

| Requirement | Phase | Phase Name | Status |
|-------------|-------|------------|--------|
| FOUND-01 | Phase 1 | Foundation | Pending |
| FOUND-02 | Phase 1 | Foundation | Pending |
| FOUND-03 | Phase 1 | Foundation | Pending |
| FOUND-04 | Phase 1 | Foundation | Pending |
| DATA-01 | Phase 1 | Foundation | Pending |
| DATA-02 | Phase 1 | Foundation | Pending |
| DATA-03 | Phase 1 | Foundation | Pending |
| DATA-04 | Phase 2 | Working Extension | Pending |
| DATA-05 | Phase 2 | Working Extension | Pending |
| CARD-01 | Phase 2 | Working Extension | Pending |
| CARD-02 | Phase 2 | Working Extension | Pending |
| CARD-03 | Phase 2 | Working Extension | Pending |
| CARD-04 | Phase 2 | Working Extension | Pending |
| CARD-05 | Phase 2 | Working Extension | Pending |
| LAYOUT-01 | Phase 2 | Working Extension | Pending |
| LAYOUT-02 | Phase 2 | Working Extension | Pending |
| LAYOUT-03 | Phase 2 | Working Extension | Pending |
| LAYOUT-04 | Phase 2 | Working Extension | Pending |
| STATE-01 | Phase 2 | Working Extension | Pending |
| STATE-02 | Phase 2 | Working Extension | Pending |

**Coverage:**
- v1 requirements: 20 total
- Mapped to phases: 20
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-21*
*Last updated: 2026-04-21 after roadmap creation*

# Roadmap: Image + Number KPI Card Extension

**Milestone:** v1.0 — Functional KPI card grid rendering live Tableau worksheet data
**Total phases:** 2
**Requirements coverage:** 20/20 v1 requirements mapped ✓

---

## Phase 1: Foundation

**Goal:** The extension loads inside Tableau Desktop, initializes the Extensions API, and reads worksheet data columns correctly — confirming the manifest, API handshake, encoding field mapping, and data pipeline are all working before any rendering begins.

**Requirements:** FOUND-01, FOUND-02, FOUND-03, FOUND-04, DATA-01, DATA-02, DATA-03

### Success Criteria

1. Loading the `-local.trex` manifest in Tableau Desktop causes the extension iframe to appear inside a worksheet without any error dialog.
2. The browser console (Tableau's embedded Chromium DevTools) shows the host worksheet name after `initializeAsync()` resolves — confirming the API handshake succeeded.
3. `getSummaryDataReaderAsync()` + `getAllPagesAsync()` returns the correct column names and raw cell values for the worksheet's current data; the DataReader is released via `releaseAsync()` in every code path.
4. `getVisualSpecificationAsync()` returns encoding captions that match the column captions obtained from the DataTable — confirming field mapping is reliable before any rendering logic is written.
5. The extension renders an initial placeholder (e.g. "Loaded") on first open with no author configuration step required.

---

## Phase 2: Working Extension

**Goal:** The extension renders all data rows as correctly styled KPI cards with live refresh, graceful error handling, and a complete Tableau-native visual presentation — the full v1 product a user ships.

**Requirements:** DATA-04, DATA-05, CARD-01, CARD-02, CARD-03, CARD-04, CARD-05, LAYOUT-01, LAYOUT-02, LAYOUT-03, LAYOUT-04, STATE-01, STATE-02

### Success Criteria

1. Each data row in the worksheet produces exactly one card: the mapped image URL renders above the mapped number, and the number displays with comma separators (e.g. `1,223,661`).
2. Cards fill the available container width in a responsive CSS grid — adding more rows causes cards to wrap naturally; all cards remain the same size regardless of image dimensions or number length.
3. Applying or removing a worksheet filter causes the card grid to re-render with updated data automatically, with no duplicate renders or browser broken-image glyphs appearing.
4. A broken or missing image URL (including `null`, empty string, `"Null"`, and `0` values) shows a neutral placeholder or hides the image area cleanly — no browser broken-image icon visible.
5. A loading indicator appears while data is being fetched, and a neutral empty-state message appears when the worksheet has zero rows or encoding fields are not yet mapped.

---

## Progress

| Phase | Name | Status | Plans |
|-------|------|--------|-------|
| 1 | Foundation | Not started | — |
| 2 | Working Extension | Not started | — |

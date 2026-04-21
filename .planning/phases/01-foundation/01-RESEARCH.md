# Phase 1: Foundation - Research

**Researched:** 2026-04-21
**Domain:** Tableau Extensions API v2 — manifest, initialization, data reading, encoding field mapping
**Confidence:** HIGH (all critical patterns verified against the live reference project at `tableau-viz/extensions/bubble-chart/`)

---

## Summary

Phase 1 establishes the wiring layer that all rendering in Phase 2 depends on: the `.trex` manifest loads the extension in Tableau Desktop, `initializeAsync()` hands us the host worksheet object, `getSummaryDataReaderAsync()` + `getAllPagesAsync()` reads the summary data, and `getVisualSpecificationAsync()` tells us which column corresponds to the image URL shelf and which to the number shelf.

The reference project (`bubble-chart`) provides a verbatim, working example of every pattern this phase needs. The most important finding from reading `chart.js` directly is the exact API shape of `getVisualSpecificationAsync()`: the return object has a `marksSpecificationCollection` array, not a `marksSpecificationsByEncoding` keyed map. Encoding lookups use `encodingCollection.find(e => e.id === id)` then `fieldCollection[0].fieldName`. This is the join key to `dataTable.columns[i].fieldName` — NOT `fieldCaption`. The architecture notes in ARCHITECTURE.md and SUMMARY.md describe the pattern correctly at a high level but use `fieldCaption` as the join key; the reference project code uses `fieldName` throughout. The planner must use `fieldName`.

The `.trex` manifest encoding block in the reference project uses `<role-spec><role-type>` child elements, not `allowed-field-data-types` / `allowed-field-role` attributes. The architecture notes show an attribute-based form that does not match the live reference. Use the child-element form from the reference.

**Primary recommendation:** Copy the exact `initializeAsync` → `getSummaryDataReaderAsync` → `releaseAsync` → `getVisualSpecificationAsync` skeleton from `chart.js` lines 9–31 directly; replace only the parsing and rendering logic.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FOUND-01 | Extension initializes via `initializeAsync()` and obtains the host worksheet | `chart.js` L9–13 is the verbatim pattern; `tableau.extensions.worksheetContent.worksheet` confirmed |
| FOUND-02 | Extension renders on first load without any author configuration step | Call render once inside `initializeAsync().then()` before registering the event listener — same as reference |
| FOUND-03 | `.trex` manifest present with `<worksheet-extension>`, `min-api-version`, `full data` permission | Reference manifest structure fully verified; permission block required for data access |
| FOUND-04 | `-local.trex` variant points to `http://localhost:8080/index.html` | Verified: reference uses full filename path in `<source-location><url>` |
| DATA-01 | `getSummaryDataReaderAsync()` + `getAllPagesAsync()`; DataReader released in `finally` | `chart.js` L15–19 is the exact try/finally pattern to replicate |
| DATA-02 | Encoding field mappings read via `getVisualSpecificationAsync()` | `chart.js` L61–75 shows exact property path: `marksSpecificationCollection[0].encodingCollection` |
| DATA-03 | Column lookup by field caption matching, never positional | Reference uses `Object.fromEntries(dataTable.columns.map(c => [c.fieldName, c.index]))` — key is `fieldName` not `fieldCaption` |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| tableau.extensions.2.latest.js | v2 (Tableau-managed CDN) | Extensions API — initializeAsync, getSummaryDataReaderAsync, getVisualSpecificationAsync, event types | Only v2 has the required data reader and visual spec APIs; confirmed in reference project |
| Vanilla HTML5 + CSS3 + ES2020 | Browser native | Shell, layout, logic | Hard project constraint; sufficient for a card grid |
| python -m http.server 8080 | stdlib | Local dev HTTP server | No build step needed; any HTTP server works |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None | — | — | No external dependencies needed for Phase 1 |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| 2.latest.js CDN | pinned semver CDN URL | Pinned gives reproducibility; `2.latest` matches reference project convention and Tableau guarantees backward compat within v2 |

**Installation:**
```bash
# No npm install — CDN-loaded only
# Dev server:
python -m http.server 8080
```

**CDN URL (verified from reference project `index.html` line 8):**
```
https://extensions.tableau.com/lib/tableau.extensions.2.latest.js
```

---

## Architecture Patterns

### Recommended Project Structure
```
img-num-ext/
├── index.html               # Shell: one div#card-container, inline <style>, two <script> tags
├── extension.js             # All logic: init → encoding → data → render → events
├── img-num-ext-local.trex   # Dev manifest pointing to http://localhost:8080/index.html
└── img-num-ext.trex         # Prod manifest (source URL to be filled at deploy time)
```

### Pattern 1: Bootstrap — initializeAsync

**What:** The entry point. Everything else must happen after this promise resolves.
**When to use:** Always — it is the mandatory first call.

```javascript
// Source: tableau-viz/extensions/bubble-chart/chart.js lines 9-13 (exact reference)
tableau.extensions.initializeAsync().then(() => {
  const ws = tableau.extensions.worksheetContent.worksheet;
  ws.addEventListener(tableau.TableauEventType.SummaryDataChanged, () => render(ws));
  render(ws);   // initial render — SummaryDataChanged does NOT fire on load
}).catch(err => showError(err.message || String(err)));
```

Key facts:
- `tableau.extensions.worksheetContent.worksheet` is `undefined` until `.then()` fires — access it nowhere else
- `SummaryDataChanged` listener registered ONCE here, never inside the render function
- `render(ws)` called once explicitly for the initial load

### Pattern 2: DataReader — getSummaryDataReaderAsync with try/finally

**What:** Reads all summary data rows. The DataReader holds a server-side cursor; `releaseAsync()` is mandatory.
**When to use:** Every time data is read (initial + every SummaryDataChanged event).

```javascript
// Source: tableau-viz/extensions/bubble-chart/chart.js lines 15-19 (exact reference)
async function fetchData(worksheet) {
  const reader = await worksheet.getSummaryDataReaderAsync(undefined, { ignoreSelection: true });
  try {
    return await reader.getAllPagesAsync();
  } finally {
    await reader.releaseAsync();
  }
}
```

Notes:
- First arg to `getSummaryDataReaderAsync` is optional options (or `undefined`)
- `{ ignoreSelection: true }` prevents the current mark selection from filtering the data — correct for a KPI grid
- `getAllPagesAsync()` buffers all pages; correct for small N (tens to low hundreds of rows)
- `releaseAsync()` in `finally` runs even if `getAllPagesAsync()` throws

### Pattern 3: Encoding Field Mapping — getVisualSpecificationAsync

**What:** Reads which data field the author dragged onto each encoding shelf.
**When to use:** On every render cycle (call alongside `fetchData` in `Promise.all`).

```javascript
// Source: tableau-viz/extensions/bubble-chart/chart.js lines 60-76 (exact reference — adapted for image+number)
function parseTableauData(dataTable, vizSpec) {
  const marksSpec = vizSpec.marksSpecificationCollection[0];
  if (!marksSpec) throw new Error('No marks specification found.');

  const encodings = marksSpec.encodingCollection;

  function fieldName(id) {
    const enc = encodings.find(e => e.id === id);
    return enc?.fieldCollection?.[0]?.fieldName ?? null;
  }

  const imageField  = fieldName('image-url');    // must match encoding id in .trex
  const numberField = fieldName('number-value'); // must match encoding id in .trex

  // Build { fieldName -> columnIndex } lookup map
  const colIndex = Object.fromEntries(
    dataTable.columns.map(c => [c.fieldName, c.index])
  );

  // Validate both fields are mapped and present in data
  if (!imageField || !(imageField in colIndex)) {
    throw new Error('Drag a URL dimension onto the "Image URL" encoding slot.');
  }
  if (!numberField || !(numberField in colIndex)) {
    throw new Error('Drag a numeric measure onto the "Number" encoding slot.');
  }

  const imgIdx = colIndex[imageField];
  const numIdx = colIndex[numberField];

  return { rows: dataTable.data, imgIdx, numIdx };
}
```

Critical: the property chain is `vizSpec.marksSpecificationCollection[0].encodingCollection` — NOT `vizSpec.marksSpecificationsByEncoding`. The `.find(e => e.id === id)` looks up by encoding ID string matching the `.trex` `<encoding id="...">` attribute. The join key between encoding and DataTable is `fieldName` — both `encodingCollection[i].fieldCollection[0].fieldName` and `dataTable.columns[i].fieldName` use the same value.

### Pattern 4: Concurrent fetch using Promise.all

**What:** Fetch encoding spec and data in parallel to minimize total latency.
**When to use:** In the render function — both are needed together.

```javascript
// Source: tableau-viz/extensions/bubble-chart/chart.js lines 22-30 (exact reference)
async function render(worksheet) {
  try {
    const [vizSpec, dataTable] = await Promise.all([
      worksheet.getVisualSpecificationAsync(),
      fetchData(worksheet),
    ]);
    const parsed = parseTableauData(dataTable, vizSpec);
    // Phase 1: console.log the results; Phase 2: build cards
    console.log('worksheet loaded, cols:', dataTable.columns.map(c => c.fieldName));
    console.log('encoding image field:', parsed.imgIdx, 'number field:', parsed.numIdx);
    document.getElementById('card-container').textContent = 'Loaded — check console';
  } catch (err) {
    document.getElementById('card-container').textContent = 'Error: ' + (err.message || String(err));
  }
}
```

### Pattern 5: .trex Manifest XML — verified structure

**What:** Declares extension metadata, source URL, API version, permissions, and encoding shelves.

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest manifest-version="0.1" xmlns="http://www.tableau.com/xml/extension_manifest">
  <worksheet-extension id="com.cyntexa.img-num-ext.local" extension-version="1.0.0">
    <default-locale>en_US</default-locale>
    <name resource-id="name"/>
    <description>Image + Number KPI Cards — local dev</description>
    <author name="Cyntexa" email="amankaushik@cyntexa.com"
            organization="Cyntexa" website="https://cyntexa.com"/>
    <min-api-version>1.1</min-api-version>
    <source-location>
      <url>http://localhost:8080/index.html</url>
    </source-location>
    <icon/>
    <encoding id="image-url">
      <display-name resource-id="image_url_label">Image URL</display-name>
      <role-spec><role-type>discrete-dimension</role-type></role-spec>
      <fields max-count="1"/>
    </encoding>
    <encoding id="number-value">
      <display-name resource-id="number_value_label">Number</display-name>
      <role-spec><role-type>continuous-measure</role-type></role-spec>
      <fields max-count="1"/>
    </encoding>
  </worksheet-extension>
  <resources>
    <resource id="name">
      <text locale="en_US">Image Number KPI (local)</text>
    </resource>
    <resource id="image_url_label">
      <text locale="en_US">Image URL</text>
    </resource>
    <resource id="number_value_label">
      <text locale="en_US">Number</text>
    </resource>
  </resources>
</manifest>
```

Verified field-by-field against `bubble-chart-local.trex`:
- `manifest-version="0.1"` — schema version of the manifest format, always `0.1`
- `<worksheet-extension>` not `<dashboard-extension>` — wrong element causes silent load failure
- `extension-version` — your own semver, any valid semver is acceptable
- `min-api-version="1.1"` — reference uses `1.1`; the methods used (getSummaryDataReaderAsync, getVisualSpecificationAsync) are v2-only but the version declared in the reference manifest is `1.1`, not `2.0`. Use `1.1` to match the working reference exactly.
- `<source-location><url>` — must be `http://localhost:8080/index.html` with explicit filename, not bare path
- `<icon/>` — empty self-closing tag is valid (reference uses this pattern)
- Encoding structure uses `<role-spec><role-type>` children — NOT attributes (`allowed-field-data-types`, `allowed-field-role`)
- `<fields max-count="1"/>` — restricts shelf to one field; required for unambiguous single-field lookup
- `<display-name resource-id="..."/>` — links to a `<resource>` entry (reference pattern); the resource ID must have a matching entry in `<resources>`

**Encoding ID to role-type mapping for this extension:**
| Encoding ID | Role Type | Rationale |
|-------------|-----------|-----------|
| `image-url` | `discrete-dimension` | URL strings are dimensions (categorical); matches reference `color`/`label` pattern |
| `number-value` | `continuous-measure` | Numeric KPI values are continuous measures; matches reference `x`/`y`/`size` pattern |

### Pattern 6: Minimal index.html scaffold (Phase 1 — no card rendering)

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Image Number KPI</title>
  <script src="https://extensions.tableau.com/lib/tableau.extensions.2.latest.js"></script>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 100%; height: 100%; overflow-x: hidden; background: #ffffff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    #card-container { padding: 16px; }
  </style>
</head>
<body>
  <div id="card-container">Loading...</div>
  <script src="extension.js"></script>
</body>
</html>
```

Notes:
- No D3 script tag (project constraint)
- `extension.js` is the ONLY local script tag; no inline script
- `card-container` div is the sole mount point; Phase 2 writes `innerHTML` here
- `overflow-x: hidden` prevents iframe scrollbar bleed (no `vw`/`vh`)
- CSS Grid rules for the container go in Phase 2 — not needed for Phase 1 scaffold

### Anti-Patterns to Avoid

- **`marksSpecificationsByEncoding` keyed map:** Does not exist in the API. Use `marksSpecificationCollection[0].encodingCollection.find(e => e.id === id)`.
- **Positional column access `row[0].value`:** Breaks when author maps fields in any order. Always use `colIndex[fieldName]`.
- **`fieldCaption` as join key:** The reference project uses `fieldName` throughout. Do not use `fieldCaption` as the join key between encoding and DataTable columns.
- **`allowed-field-data-types` / `allowed-field-role` attributes in `.trex`:** This is an alternate schema form that does not match the working reference. Use `<role-spec><role-type>` child elements.
- **`min-api-version="2.0"` or `"2.1"` in manifest:** Reference uses `"1.1"` and works. Do not change without testing; Tableau may block load on older Desktop installs.
- **Listener inside render function:** Accumulates duplicate handlers on each data change.
- **`file://` protocol:** Tableau Desktop blocks Extensions API on `file://` — HTTP server is mandatory.
- **`getSummaryDataAsync()` (v1):** Deprecated; use `getSummaryDataReaderAsync()` + `getAllPagesAsync()`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Column-by-name lookup | Custom indexing logic | `Object.fromEntries(dataTable.columns.map(c => [c.fieldName, c.index]))` | One-liner from reference project — already the correct pattern |
| DataReader lifecycle | Manual cursor management | `try { ... } finally { await reader.releaseAsync(); }` | Reference pattern; any deviation risks cursor leak |
| Encoding-to-field resolution | Custom property traversal | `encodingCollection.find(e => e.id === id)?.fieldCollection?.[0]?.fieldName` | Exact reference pattern; optional chaining handles unmapped shelves |
| Concurrent API calls | Sequential awaits | `Promise.all([getVisualSpecificationAsync(), fetchData(ws)])` | Reference pattern; halves latency with zero complexity cost |

**Key insight:** The reference project (`chart.js`) is a working, tested template. Every pattern in Phase 1 already exists in it. Copy structure; replace domain-specific IDs.

---

## Common Pitfalls

### Pitfall 1: DataReader Not Released (CRITICAL)
**What goes wrong:** Extension populates on first load but silently stops updating after any filter interaction. Second call to `getSummaryDataReaderAsync` may hang or throw.
**Why it happens:** The DataReader holds a server-side cursor. Without `releaseAsync()`, it is never freed.
**How to avoid:** Always wrap `getAllPagesAsync()` in `try { } finally { await reader.releaseAsync(); }` — no exceptions, including error paths.
**Warning signs:** Works on load; freezes after first filter change.

### Pitfall 2: SummaryDataChanged Listener Registered Multiple Times (CRITICAL)
**What goes wrong:** Each render cycle adds another handler. After N filter changes, the handler fires N times — N concurrent data reads, N DOM re-renders, visible card flash.
**Why it happens:** Listener registration placed inside the render function instead of the init chain.
**How to avoid:** Register exactly once in `initializeAsync().then(()  => { ws.addEventListener(...); render(ws); })`.
**Warning signs:** Cards flash or duplicate on second filter interaction.

### Pitfall 3: Wrong API Property Path for Encoding Spec
**What goes wrong:** `TypeError: Cannot read properties of undefined` when reading `vizSpec.marksSpecificationsByEncoding`.
**Why it happens:** The actual property is `vizSpec.marksSpecificationCollection[0].encodingCollection`, not a keyed map.
**How to avoid:** Use `marksSpecificationCollection[0]`; log the full `vizSpec` on first run to verify shape before writing lookup code.
**Warning signs:** TypeError at parse step; encodings always null.

### Pitfall 4: fieldCaption vs fieldName Mismatch
**What goes wrong:** `colIndex[imageCaption]` returns `undefined`; image and number indices come back `-1`; all cards broken.
**Why it happens:** Using `fieldCaption` (display label) as the join key when the DataTable column is keyed by `fieldName` (internal name). In many workbooks these differ.
**How to avoid:** Use `c.fieldName` when building `colIndex`; use `enc.fieldCollection[0].fieldName` from encodingCollection (not `.fieldCaption`). Log both on first run to verify they match.
**Warning signs:** `colIndex[field]` is always `undefined`; encoding lookup returns `null`.

### Pitfall 5: .trex URL Mismatch
**What goes wrong:** Tableau shows "Unable to load the extension" or blank iframe.
**Why it happens:** `localhost` and `127.0.0.1` are different origins; bare path `http://localhost:8080/` may return directory listing.
**How to avoid:** Use exactly `http://localhost:8080/index.html`. Verify with `curl http://localhost:8080/index.html` before loading in Tableau.
**Warning signs:** Blank iframe or load error dialog at startup.

### Pitfall 6: getVisualSpecificationAsync Returns Empty Collection on Unmapped Worksheet
**What goes wrong:** `marksSpecificationCollection[0]` is undefined; `encodingCollection` throws.
**Why it happens:** Author opens extension on a blank worksheet before dragging any fields onto encoding shelves.
**How to avoid:** Guard `if (!marksSpec)` and render an empty-state message. Phase 1's success criteria include no configuration step needed — but "no fields mapped" is a valid starting state that must not crash.
**Warning signs:** TypeError on `marksSpec.encodingCollection` when opening on fresh worksheet.

---

## Code Examples

### Full Phase 1 extension.js scaffold (verified against reference)

```javascript
// Source: adapted from tableau-viz/extensions/bubble-chart/chart.js
'use strict';

// ─── Bootstrap ────────────────────────────────────────────────────────────────
tableau.extensions.initializeAsync().then(() => {
  const ws = tableau.extensions.worksheetContent.worksheet;
  console.log('[img-num-ext] worksheet:', ws.name);

  ws.addEventListener(tableau.TableauEventType.SummaryDataChanged, () => render(ws));
  render(ws);  // initial render — SummaryDataChanged does not fire on load

}).catch(err => showStatus('Init error: ' + (err.message || String(err))));

// ─── Render ───────────────────────────────────────────────────────────────────
async function render(worksheet) {
  showStatus('Loading...');
  try {
    const [vizSpec, dataTable] = await Promise.all([
      worksheet.getVisualSpecificationAsync(),
      fetchData(worksheet),
    ]);
    // Phase 1: verify pipeline — log and show placeholder
    const parsed = parseFields(dataTable, vizSpec);
    console.log('[img-num-ext] imgIdx:', parsed.imgIdx, 'numIdx:', parsed.numIdx);
    console.log('[img-num-ext] row count:', dataTable.data.length);
    showStatus('Loaded — ' + dataTable.data.length + ' rows');
  } catch (err) {
    showStatus('Error: ' + (err.message || String(err)));
  }
}

// ─── Data fetch ───────────────────────────────────────────────────────────────
async function fetchData(worksheet) {
  const reader = await worksheet.getSummaryDataReaderAsync(undefined, { ignoreSelection: true });
  try {
    return await reader.getAllPagesAsync();
  } finally {
    await reader.releaseAsync();
  }
}

// ─── Field mapping ────────────────────────────────────────────────────────────
function parseFields(dataTable, vizSpec) {
  const marksSpec = vizSpec.marksSpecificationCollection[0];
  if (!marksSpec) return { imgIdx: -1, numIdx: -1, missing: 'no marks spec' };

  const encodings = marksSpec.encodingCollection;

  function resolveFieldName(encodingId) {
    const enc = encodings.find(e => e.id === encodingId);
    return enc?.fieldCollection?.[0]?.fieldName ?? null;
  }

  const imageField  = resolveFieldName('image-url');
  const numberField = resolveFieldName('number-value');

  const colIndex = Object.fromEntries(
    dataTable.columns.map(c => [c.fieldName, c.index])
  );

  console.log('[img-num-ext] columns:', Object.keys(colIndex));
  console.log('[img-num-ext] imageField:', imageField, 'numberField:', numberField);

  const imgIdx = imageField && imageField in colIndex ? colIndex[imageField] : -1;
  const numIdx = numberField && numberField in colIndex ? colIndex[numberField] : -1;

  return { imgIdx, numIdx };
}

// ─── UI helpers ───────────────────────────────────────────────────────────────
function showStatus(msg) {
  document.getElementById('card-container').textContent = msg;
}
```

### Column index map construction (pure function, easy to test)
```javascript
// Source: tableau-viz/extensions/bubble-chart/chart.js line 76
const colIndex = Object.fromEntries(dataTable.columns.map(c => [c.fieldName, c.index]));
```

### Encoding field name resolution (pure function, easy to test)
```javascript
// Source: tableau-viz/extensions/bubble-chart/chart.js lines 65-68
function resolveFieldName(encodingCollection, encodingId) {
  const enc = encodingCollection.find(e => e.id === encodingId);
  return enc?.fieldCollection?.[0]?.fieldName ?? null;
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `getSummaryDataAsync()` (v1) | `getSummaryDataReaderAsync()` + `getAllPagesAsync()` | Extensions API v2 | v1 method deprecated; use v2 |
| `marksSpecificationsByEncoding` (keyed map) | `marksSpecificationCollection[0].encodingCollection` (array) | Not a version change — was always array | Developers assuming a keyed map write broken lookup code |
| Attribute-style encoding constraints (`allowed-field-data-types`) | `<role-spec><role-type>` child elements | Not a version change — both may exist in different manifest versions | Wrong form causes encoding shelves not to render in Tableau's field mapping UI |

**Deprecated/outdated:**
- `getSummaryDataAsync()`: Do not use — missing from v2 API surface.
- `marksSpecificationsByEncoding` object form: Not present in reference project output; do not assume this shape.

---

## Open Questions

1. **`fieldName` vs `fieldCaption` alignment in production workbooks**
   - What we know: Reference project uses `fieldName` as join key and it works
   - What's unclear: Whether `fieldName` and `fieldCaption` ever coincide in test workbooks, masking a potential bug
   - Recommendation: On first load, log BOTH `c.fieldName` and `c.fieldCaption` for all columns AND both `fieldCollection[0].fieldName` and any `.fieldCaption` on the encoding object. Verify visually before proceeding to Phase 2.

2. **`marksSpecificationCollection` cardinality**
   - What we know: Reference always accesses `[0]` and it works; worksheet extensions have one marks layer
   - What's unclear: Whether this can be empty (e.g., on a blank worksheet with no fields placed at all — distinct from "fields not mapped to encodings")
   - Recommendation: Guard `if (!marksSpec) { showEmptyState(); return; }` in all paths.

3. **`ignoreSelection: true` option behavior**
   - What we know: Reference passes `{ ignoreSelection: true }` to `getSummaryDataReaderAsync`
   - What's unclear: Whether KPI cards should reflect the current mark selection or always show all data
   - Recommendation: Use `{ ignoreSelection: true }` for Phase 1 (matches reference); revisit in Phase 2 if selection-awareness is desired.

4. **min-api-version in manifest**
   - What we know: Reference uses `"1.1"` despite calling v2-only methods; it works
   - What's unclear: Whether declaring `"1.1"` causes any compatibility issues or is merely a floor version for Desktop compatibility checking
   - Recommendation: Use `"1.1"` to match the working reference. Do not change to `"2.0"` or `"2.1"` without testing.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None detected — no test config or test files in project root |
| Config file | None — Wave 0 gap |
| Quick run command | N/A until framework installed |
| Full suite command | N/A until framework installed |

Phase 1 is a wiring/integration layer (Tableau Desktop API calls). The core verifiable logic is pure and can be unit-tested in isolation; the API-dependent wiring requires Tableau Desktop for integration testing.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FOUND-01 | `initializeAsync()` resolves and worksheet name is accessible | manual (Tableau Desktop) | — | ❌ Wave 0 |
| FOUND-02 | Extension renders "Loaded" on first open without config step | manual (Tableau Desktop) | — | ❌ Wave 0 |
| FOUND-03 | `.trex` XML parses and extension loads in Tableau Desktop | manual (Tableau Desktop) | — | ❌ Wave 0 |
| FOUND-04 | `-local.trex` URL resolves to `http://localhost:8080/index.html` | smoke: `curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/index.html` | `bash -c 'curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/index.html'` | ❌ Wave 0 |
| DATA-01 | `fetchData()` returns DataTable and releases reader | unit: pure async wrapper — testable with mock worksheet | `node tests/test-fetch.js` (stub worksheet) | ❌ Wave 0 |
| DATA-02 | `getVisualSpecificationAsync()` encoding captions match DataTable columns | manual (Tableau Desktop) + unit for `parseFields()` | `node tests/test-parse-fields.js` | ❌ Wave 0 |
| DATA-03 | `parseFields()` returns correct column indices by fieldName | unit: pure function | `node tests/test-parse-fields.js` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `curl http://localhost:8080/index.html` smoke test (verifies dev server)
- **Per wave merge:** Manual validation in Tableau Desktop per roadmap success criteria 1–4
- **Phase gate:** All 5 roadmap success criteria verified in Tableau Desktop before proceeding to Phase 2

### Wave 0 Gaps
- [ ] `tests/test-parse-fields.js` — unit tests for `parseFields()` pure function (DATA-02, DATA-03); can use plain `node` with no framework
- [ ] `tests/test-fetch.js` — unit test for `fetchData()` try/finally pattern with mock worksheet (DATA-01)
- [ ] No test framework needed for Phase 1 — Node.js `assert` module is sufficient for the two pure-function tests

*(Integration tests for FOUND-01 through FOUND-04 require a live Tableau Desktop session and are manual-only.)*

---

## Sources

### Primary (HIGH confidence)
- `tableau-viz/extensions/bubble-chart/chart.js` — live reference implementation; all API patterns verified by reading actual code
- `tableau-viz/extensions/bubble-chart/index.html` — CDN URL, HTML scaffold pattern
- `tableau-viz/extensions/bubble-chart/bubble-chart-local.trex` — exact manifest XML structure including encoding child-element form
- `.planning/research/STACK.md` — stack constraints and confirmed CDN URL
- `.planning/research/ARCHITECTURE.md` — data flow and component structure
- `.planning/research/PITFALLS.md` — critical failure modes
- `.planning/REQUIREMENTS.md` — requirement IDs and acceptance criteria

### Secondary (MEDIUM confidence)
- `.planning/research/SUMMARY.md` — synthesized patterns; note that `fieldCaption` vs `fieldName` distinction differs from what the reference code actually uses

### Tertiary (LOW confidence — flag for validation)
- Architecture note that `marksSpecificationsByEncoding` is a keyed map: CONTRADICTED by reference code. Discard.
- Architecture/STACK notes showing `allowed-field-data-types` / `allowed-field-role` attributes in `.trex`: NOT used in reference. Use `<role-spec><role-type>` form instead.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — CDN URL and API methods verified from live reference project source code
- Architecture (initializeAsync, DataReader, Promise.all): HIGH — exact reference code read and documented
- `marksSpecificationCollection` property path: HIGH — verified from `chart.js` line 61; corrects pre-existing research notes that assumed a keyed map
- `.trex` encoding element structure: HIGH — verified from `bubble-chart-local.trex`; corrects attribute-form shown in STACK.md
- `fieldName` vs `fieldCaption` as join key: HIGH — reference uses `fieldName` consistently; flagged for Step 3/4 logging validation in Tableau Desktop
- Pitfalls: HIGH — sourced from PITFALLS.md which was verified against known Tableau API behavior

**Research date:** 2026-04-21
**Valid until:** 2026-07-21 (stable Tableau API; manifest schema does not change within major versions)

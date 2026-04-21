# Pitfalls Research: Image + Number KPI Card Extension

**Domain:** Tableau custom worksheet extension (static HTML/CSS/JS, Extensions API v2)
**Researched:** 2026-04-21

---

## Critical Pitfalls

### 1. DataReader Not Released After Read

**What goes wrong:** `getSummaryDataReaderAsync()` returns a `DataTableReader` holding a server-side cursor. Without `reader.releaseAsync()`, the cursor leaks. On first load this is silent. On subsequent `SummaryDataChanged` events, Tableau stalls or errors.

**Warning signs:** Extension populates on first load but stops updating after filter interactions; unhandled promise rejections on second `getSummaryDataReaderAsync` call.

**Prevention:** Always wrap in try/finally:
```js
const reader = await worksheet.getSummaryDataReaderAsync();
try {
  const table = await reader.getAllPagesAsync();
  // process table
} finally {
  await reader.releaseAsync();
}
```

**Phase:** Foundation / data-reading

---

### 2. Registering SummaryDataChanged Listener Multiple Times

**What goes wrong:** If the listener registration lives inside the render function rather than in `initializeAsync`, each data change registers an additional handler. After N filter interactions, the handler fires N times — N concurrent reads, N DOM re-renders.

**Warning signs:** Cards flash or render duplicated on second filter interaction.

**Prevention:** Register the listener exactly once inside the `initializeAsync` callback:
```js
tableau.extensions.initializeAsync().then(() => {
  const ws = tableau.extensions.worksheetContent.worksheet;
  ws.addEventListener(tableau.TableauEventType.SummaryDataChanged, handleChange);
  renderCards(); // initial render
});
```

**Phase:** Foundation / event wiring

---

### 3. Accessing worksheet Before initializeAsync Resolves

**What goes wrong:** `tableau.extensions.worksheetContent` is `undefined` until `initializeAsync()` resolves. Any synchronous worksheet access throws TypeError and leaves the extension blank.

**Warning signs:** "Cannot read properties of undefined" in console at startup; blank extension that sometimes works after browser refresh.

**Prevention:** Every line of worksheet access must live inside the `.then()` / `await` chain of `initializeAsync()`.

**Phase:** Foundation / initialization

---

### 4. Encoding Field Lookup by Array Index

**What goes wrong:** `getVisualSpecificationAsync()` encoding array order reflects how the author mapped fields — not a fixed contract. Hardcoding `encodings[0]` breaks when author maps fields in different order. Same applies to DataTable column index.

**Warning signs:** Images show numbers; number slots show URL strings.

**Prevention:**
```js
// WRONG
const urlValue = row[0].value;

// CORRECT
const urlCol = columns.findIndex(c => c.fieldName === imageFieldName);
const urlValue = row[urlCol].value;
```

**Phase:** Data parsing / field mapping

---

### 5. Null / Null-Equivalent Cell Values Not Guarded

**What goes wrong:** Tableau cells can carry `null`, the string `"Null"`, empty string `""`, or `0`. All four are valid "missing" states. `<img src="Null">` fires a real 404 request. `Number("Null")` returns `NaN` — displays as `"NaN"` to users.

**Prevention:**
```js
function parseUrl(cell) {
  const v = cell?.value;
  if (v == null || v === '' || v === 'Null') return null;
  return String(v);
}
function parseNumber(cell) {
  const v = cell?.value;
  if (v == null || v === '' || v === 'Null') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}
```

**Phase:** Data parsing / card rendering

---

### 6. CORS and CSP Blocking External Image URLs

**What goes wrong:** In some corporate Tableau Desktop environments, CSP blocks images from un-whitelisted domains. Do NOT add `crossorigin="anonymous"` to `<img>` tags — it makes images subject to CORS preflight which many CDN-hosted images fail.

**Warning signs:** Broken image icons in one environment but not another; CSP violation messages in console.

**Prevention:**
- Do NOT add `crossorigin="anonymous"` to `<img>` tags.
- Always wire `onerror` on every `<img>`: `img.onerror = () => { img.style.display = 'none'; }`
- Document that image URLs must be reachable from the machine running Tableau Desktop.

**Phase:** Card rendering / image handling

---

### 7. .trex Manifest URL Must Match Running Server Exactly

**What goes wrong:** `localhost` and `127.0.0.1` are different origins to Tableau. HTTP vs HTTPS mismatch fails silently. Bare path `http://localhost:8080/` may return a directory listing on some Python versions.

**Warning signs:** "Unable to load the extension" or blank iframe at startup.

**Prevention:** Always use `http://localhost:8080/index.html` — explicit filename, never bare path. Verify with `curl http://localhost:8080/index.html` before loading in Tableau.

**Phase:** Manifest / dev setup

---

### 8. CSS Viewport Units (vw, vh) Inside Tableau's iframe

**What goes wrong:** Inside Tableau's iframe, `100vw` includes the iframe scrollbar width — causing a horizontal scrollbar to appear.

**Prevention:**
```css
html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow-x: hidden; }
```
Use `width: 100%` on the grid container. Avoid `vw`/`vh`. Always test inside Tableau Desktop, not just a standalone browser.

**Phase:** Styling / layout

---

### 9. CSS Grid Zero Height When Container Has No Children

**What goes wrong:** `auto-fill` grid produces zero-height when empty — indistinguishable from a broken extension.

**Prevention:** Always render explicit loading-state and empty-state DOM elements. A simple `<p>Loading...</p>` replaced by cards or an empty-state message is sufficient.

**Phase:** Card rendering / empty and error states

---

## Moderate Pitfalls

### 10. Concurrent Re-Renders During Rapid Filter Changes

**What goes wrong:** Two `SummaryDataChanged` events in quick succession start two concurrent async renders. Whichever finishes last wins — may be the staler dataset.

**Prevention:**
```js
let rendering = false;
async function handleDataChange() {
  if (rendering) return;
  rendering = true;
  try { await renderCards(); }
  finally { rendering = false; }
}
```

**Phase:** Event handling / data refresh

---

### 11. getVisualSpecificationAsync Returning Empty Encodings

**What goes wrong:** When placed on a blank worksheet, encoding arrays are empty. `encodings[0].fieldName` throws TypeError.

**Prevention:** Check encoding arrays are non-empty. Render "No fields mapped — please configure the extension" if missing.

**Phase:** Foundation / initialization

---

### 12. Unconstrained Image Dimensions Breaking Card Grid

**What goes wrong:** External images of arbitrary dimensions expand cards beyond the grid column width, breaking rows.

**Prevention:**
```css
.card img { width: 100%; height: 120px; object-fit: contain; display: block; }
```

**Phase:** Styling / card layout

---

### 13. Number Type Coercion From Tableau Data

**What goes wrong:** `cell.formattedValue` may contain Tableau's own locale formatting. Calling `Number()` on `formattedValue` breaks. Calling `toLocaleString()` on `formattedValue` double-formats.

**Prevention:** Use `Number(cell.value)` (not `formattedValue`) with an explicit `isNaN` guard.

**Phase:** Data parsing / card rendering

---

## Minor Pitfalls

### 14. Forgetting Initial Render After initializeAsync

`SummaryDataChanged` does not fire on load. Call the render function once explicitly after `initializeAsync()` resolves.

### 15. Missing `<meta charset>` or `<meta viewport>`

Always include both in `<head>`:
```html
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
```

---

## Key Findings

- **Most dangerous:** Not releasing `DataTableReader` via `releaseAsync()` — silently breaks all subsequent data refreshes.
- **Second most dangerous:** Registering event listener inside the render function — accumulates duplicate handlers.
- **Image safety:** Two layers required — `onerror` on every `<img>` AND null/empty/`"Null"` guards before assigning `src`.
- **CSS:** `vw`/`vh` unreliable inside Tableau iframe — use percentage widths.
- **Manifest:** `localhost` ≠ `127.0.0.1` to Tableau; use explicit `/index.html` filename.
- **Field lookup:** Always by field name, never by column index.
- **Initial render:** Must be triggered explicitly — `SummaryDataChanged` does not fire on load.
- **Null values:** Guard all four variants: `null`, `"Null"`, `""`, `0`.

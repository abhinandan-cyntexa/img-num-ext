# Stack Research: Image + Number KPI Card Extension

**Project:** Tableau Custom Worksheet Extension — Image + Number KPI Cards
**Researched:** 2026-04-21
**Scope:** Tableau Extensions API v2, .trex manifest, local dev, browser APIs

---

## Recommended Stack

### Tableau Extensions API Library

- **tableau.extensions.2.latest.js** — load via `<script src="https://extensions.tableau.com/lib/tableau.extensions.2.latest.js"></script>` [confidence: HIGH — explicitly confirmed in PROJECT.md from the working `tableau-viz` reference project]

  The `2.latest.js` slug tracks the latest patch of the v2 major line without requiring a pinned semver. Tableau controls this CDN and guarantees backward-compatible updates within the v2 major. For a no-build-tool, no-npm setup this is the correct loading pattern — there is no npm package to install.

  Do NOT use `tableau.extensions.1.latest.js` (v1 API). The `getSummaryDataReaderAsync()` and `getVisualSpecificationAsync()` methods used by the reference project are v2-only. [confidence: HIGH]

### Core API Surface

All four confirmed working in the sibling reference project (`tableau-viz`):

| Method / Event | Purpose |
|---|---|
| `tableau.extensions.initializeAsync()` | Bootstrap — must resolve before any other API call |
| `worksheet.getSummaryDataReaderAsync()` | Reads current summary data rows via streaming DataTableReader |
| `worksheet.getVisualSpecificationAsync()` | Reads encoding mappings (which field = image URL, which = measure) |
| `TableauEventType.SummaryDataChanged` | Event fired on filter change or data refresh |

Access the active worksheet in a worksheet extension context:

```js
const worksheet = tableau.extensions.worksheetContent.worksheet;
```

[confidence: MEDIUM — standard v2 worksheet extension pattern; consistent with reference project usage]

### HTML / CSS / JS Runtime

- **Vanilla HTML5 + CSS3 + ES2020 JS** — no framework, no build step, no npm [confidence: HIGH — hard constraint]
- **Two-file structure:** `index.html` + single JS file (e.g. `extension.js`), matching the reference project's `index.html` + `chart.js` pattern [confidence: HIGH]
- **No ES modules** — use classic `<script src="...">` tags; `type="module"` adds complexity with zero benefit in a no-build single-file setup [confidence: HIGH]

### .trex Manifest File

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest manifest-version="0.1" xmlns="http://www.tableau.com/xml/extension_manifest">
  <worksheet-extension id="com.cyntexa.img-num-kpi" extension-version="0.1.0">
    <default-locale>en_US</default-locale>
    <name resource-id="name"/>
    <description>Image + Number KPI Card Extension</description>
    <author name="Cyntexa" email="amankaushik@cyntexa.com" organization="Cyntexa" website="https://cyntexa.com"/>
    <min-api-version>2.0</min-api-version>
    <source-location>
      <url>http://localhost:8080/index.html</url>
    </source-location>
    <permissions>
      <permission>full data</permission>
    </permissions>
  </worksheet-extension>
  <resources>
    <resource id="name">
      <string locale="en_US">Image Number KPI</string>
    </resource>
  </resources>
</manifest>
```

Key rules:
- `manifest-version="0.1"` — schema version of the manifest format itself, always `0.1`; not your extension version
- `<worksheet-extension>` not `<dashboard-extension>` — wrong element type causes a silent load failure
- `id` — reverse-domain notation, must be unique across Tableau's extension registry
- `min-api-version="2.0"` — declares v2 dependency; blocks load on older Desktop versions
- `<permission>full data</permission>` — required to call `getSummaryDataReaderAsync()`; without it, data access is blocked
- `encoding="utf-8"` in the XML declaration — required; Tableau's parser expects UTF-8
- `<icon>` element is optional; if present, must be a base64-encoded 70x70 PNG

[confidence: MEDIUM — structure matches Tableau's published .trex schema and known patterns]

### Local Development Pattern

Two manifest files, same extension source:

| File | URL in `<source-location>` | When Used |
|---|---|---|
| `img-num-kpi.trex` | Production/staging URL | Tableau Server / Tableau Cloud |
| `img-num-kpi-local.trex` | `http://localhost:8080/index.html` | Local development only |

**Dev server:** `python -m http.server 8080` run from the extension directory. [confidence: HIGH]

Why this is sufficient:
- No build step, so no watcher needed
- Tableau Extensions API calls go to the Tableau process itself, not an HTTP endpoint — no proxying needed
- CORS is not a concern for the Extensions API script (same-origin served)
- `<img src="...">` tag loads are not subject to CORS (only `fetch()` is)
- Tableau Desktop does not require HTTPS for `localhost` extension sources

`file://` protocol does not work — Tableau Desktop's embedded browser blocks Extensions API initialization on `file://` URLs. An HTTP server is mandatory.

### Browser API Compatibility

Tableau Desktop embeds a Chromium-based browser via Qt WebEngine. All currently supported Tableau Desktop versions (2022.x+) embed a Chromium baseline of roughly Chrome 100+. All APIs below are safe without polyfills.

| API | Safe? | Confidence | Notes |
|---|---|---|---|
| CSS Grid (`display:grid`, `auto-fill`, `minmax()`) | YES | HIGH | Fully supported; correct layout primitive for auto-responsive card grid |
| `Intl.NumberFormat('en-US')` | YES | HIGH | V8 built-in; produces `1,223,661` correctly |
| `<img src="...">` for remote URLs | YES | HIGH | CORS does not apply to `<img>` tag loads |
| `async`/`await` | YES | HIGH | Required for Tableau API Promise chain |
| ES2020 (`?.`, `??`, `Promise.allSettled`) | YES | HIGH | All supported in Chromium 110+ |
| CSS Custom Properties | YES | HIGH | Useful for Tableau light-theme color tokens |
| `localStorage` | AVOID | MEDIUM | Known quirky behavior in Tableau's sandboxed context |
| Service Workers | NO | HIGH | Cannot register in Tableau's embedded browser context |

### Polyfills

**None required.** Modern Chromium baseline covers all needed APIs.

---

## What NOT to Use

| Technology | Reason |
|---|---|
| React / Vue / Angular | Hard project constraint; unnecessary for a flat card list |
| D3.js | Explicitly out of scope; adds ~250 KB for chart primitives not needed here |
| npm / webpack / Vite | Hard project constraint; no build toolchain |
| Tableau Extensions API v1 | v2 required for `getSummaryDataReaderAsync()` and `getVisualSpecificationAsync()` |
| `file://` protocol for dev | Tableau Desktop blocks Extensions API initialization on `file://` URLs |
| `getSummaryDataAsync()` (v1-style) | Deprecated; use `getSummaryDataReaderAsync()` + `getAllPagesAsync()` |
| CSS `float` or `inline-block` for card grid | CSS Grid is cleaner, more robust, and natively responsive |

---

## Key Findings

- CDN URL `https://extensions.tableau.com/lib/tableau.extensions.2.latest.js` confirmed from reference project — use exactly.
- `.trex` manifest must use `<worksheet-extension>`, declare `min-api-version="2.0"`, and include `<permission>full data</permission>`.
- Two `.trex` files is standard: `-local.trex` for dev, base `.trex` for production URL.
- `python -m http.server 8080` is fully sufficient for local dev.
- CSS Grid `auto-fill` + `minmax()` is the correct responsive card layout — no framework needed.
- `Intl.NumberFormat('en-US')` handles comma-separated number formatting natively.
- `<img src="...">` loads cross-origin image URLs without CORS issues.
- No polyfills needed.

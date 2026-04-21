# Image + Number Grid Tableau Extension

This repo contains a static Tableau Viz Extension that renders a responsive grid of image-plus-number KPI cards from worksheet summary data.

It is the multi-card version of the validated `img-num-ext-single` project. The runtime keeps the same Tableau API flow, field mapping diagnostics, image fallback behavior, vendored Tableau SDK, and local HTTP/HTTPS test setup.

## Current Status

Last verified: 2026-04-22

- Plain HTML, CSS, and JavaScript only
- No npm, build step, backend, or external runtime dependency
- Tableau Extensions API SDK is vendored at `vendor/tableau.extensions.1.latest.js`
- Renders one card for each summary data row returned by Tableau
- Supports the same two Tableau Marks card encodings as the single-card version:
  - `Image URL`
  - `Value`
- Uses `getVisualSpecificationAsync()` to resolve mapped fields
- Uses `getSummaryDataReaderAsync()` and always releases the reader
- Re-renders on `SummaryDataChanged`
- Shows a visible status panel for current state, field mappings, and rendered row count
- Uses a neutral placeholder for blank or broken image URLs

## Project Files

| File | Purpose |
|---|---|
| `index.html` | Main Tableau runtime page loaded by the `.trex` manifest |
| `styles.css` | Responsive grid, card layout, image fallback, status panel, and empty/error states |
| `chart.js` | Tableau initialization, mapping diagnostics, data parsing, and grid rendering |
| `img-num-ext-local.trex` | Local HTTP Tableau Desktop manifest |
| `img-num-ext-https-local.trex` | Local HTTPS Tableau Online manifest |
| `img-num-ext-debug-https-local.trex` | HTTPS diagnostic manifest for isolating load issues |
| `img-num-ext-github-pages.trex` | GitHub Pages manifest for hosted HTTPS loading |
| `img-num-ext.trex` | Production manifest pointing at GitHub Pages |
| `debug.html` | Minimal Tableau SDK handshake page |
| `serve_https.py` | Python HTTPS static server with no-cache headers |
| `test-data/image-number-grid.xls` | Minimal Tableau test workbook copied from the single-card validation project |
| `vendor/tableau.extensions.1.latest.js` | Local Tableau Extensions API SDK |

## Runtime Behavior

1. `tableau.extensions.initializeAsync()` connects to Tableau.
2. `worksheet.getVisualSpecificationAsync()` reads the mapped encoding fields.
3. `worksheet.getSummaryDataReaderAsync()` loads worksheet summary data.
4. `chart.js` supports both current visual-spec fields (`marksSpecifications`) and older sample-style fields (`marksSpecificationCollection`).
5. Required mappings are validated against the returned summary-data columns.
6. Every returned data row becomes one card in the CSS grid.
7. Each card renders the mapped image URL above the comma-formatted mapped value.
8. Blank or broken image URLs show the same neutral fallback icon used by the single-card project.
9. `SummaryDataChanged` triggers a full re-render.

## Local Tableau Desktop Test

Start a local static server from this repo:

```bash
python3 -m http.server 8082
```

The Tableau runtime URL is:

```text
http://localhost:8082/index.html
```

Load this manifest in Tableau Desktop:

```text
img-num-ext-local.trex
```

Map fields:

- Drag `Image URL` to the extension's `Image URL` encoding.
- Drag `Value` or `SUM(Value)` to the extension's `Value` encoding.

The included workbook can be used for a quick test:

```text
test-data/image-number-grid.xls
```

## Tableau Online HTTPS Test

Create local certificate files:

```bash
mkdir -p certs
mkcert -cert-file certs/localhost.pem -key-file certs/localhost-key.pem localhost 127.0.0.1 ::1
```

If `mkcert` is not available, use OpenSSL:

```bash
mkdir -p certs
openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
  -keyout certs/localhost-key.pem \
  -out certs/localhost.pem \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
```

Start the HTTPS server:

```bash
python3 serve_https.py
```

Open this URL in the same browser and accept the certificate warning if prompted:

```text
https://localhost:8443/debug.html
```

Use the diagnostic manifest first:

```text
img-num-ext-debug-https-local.trex
```

Then use the real HTTPS manifest:

```text
img-num-ext-https-local.trex
```

## GitHub Pages

Hosted extension URL:

```text
https://abhinandan-cyntexa.github.io/img-num-ext/index.html
```

Use this manifest after GitHub Pages is enabled for the repository:

```text
img-num-ext-github-pages.trex
```

## Verification Commands

Run these from the repo root:

```bash
node --check chart.js
xmllint --noout img-num-ext-local.trex
xmllint --noout img-num-ext-https-local.trex
xmllint --noout img-num-ext-debug-https-local.trex
xmllint --noout img-num-ext-github-pages.trex
xmllint --noout img-num-ext.trex
file test-data/image-number-grid.xls
```

Expected result:

- `node --check` prints no syntax errors
- `xmllint` prints no XML errors
- `file` reports a legacy Microsoft Excel workbook

## Scope Limits

- No label/title field in v1
- No number abbreviation toggle
- No prefix/suffix controls
- No click-to-filter interaction
- No build tooling or package manager

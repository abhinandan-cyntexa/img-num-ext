# Image + Number Grid Tableau Extension

This repo contains a static Tableau Viz Extension that renders a responsive grid of image-plus-number KPI cards from worksheet summary data.

It is the multi-card version of the validated `img-num-ext-single` project. The runtime keeps the same Tableau API flow, field mapping diagnostics, image fallback behavior, vendored Tableau SDK, and local HTTP/HTTPS test setup.

## Current Status

Last verified: 2026-04-22

- Plain HTML, CSS, and JavaScript only
- No npm, build step, backend, or external runtime dependency
- Tableau Extensions API SDK is vendored at `vendor/tableau.extensions.1.latest.js`
- Renders one card for each valid Image URL / Value field pair on each summary data row
- Supports up to 15 fields in each Tableau Marks card encoding:
  - `Image URL`
  - `Value`
- Uses `getVisualSpecificationAsync()` to resolve mapped fields
- Uses `getSummaryDataReaderAsync()` with worksheet formatting applied and always releases the reader
- Re-renders on `SummaryDataChanged` and `WorksheetFormattingChanged`
- Shows up to three cards per row on wide panes, then two or one card per row as space narrows
- Uses a neutral placeholder for blank or broken image URLs

## Project Files

| File | Purpose |
|---|---|
| `index.html` | Main Tableau runtime page loaded by the `.trex` manifest |
| `styles.css` | Responsive grid, card layout, image fallback, and empty/error states |
| `chart.js` | Tableau initialization, mapping diagnostics, data parsing, and grid rendering |
| `img-num-ext-local.trex` | Local HTTP Tableau Desktop manifest |
| `img-num-ext-https-local.trex` | Local HTTPS Tableau Online manifest |
| `img-num-ext-debug-https-local.trex` | HTTPS diagnostic manifest for isolating load issues |
| `img-num-ext-github-pages.trex` | GitHub Pages manifest for hosted HTTPS loading |
| `img-num-ext.trex` | Production manifest pointing at GitHub Pages |
| `debug.html` | Minimal Tableau SDK handshake page |
| `serve_https.py` | Python HTTPS static server with no-cache headers |
| `test-data/image-number-grid.xls` | Excel-compatible 15-pair test workbook with inline SVG image URLs |
| `test-data/image-number-grid.csv` | 15-pair wide CSV dataset with `img_url_1` / `img_val_1` through `img_url_15` / `img_val_15` |
| `vendor/tableau.extensions.1.latest.js` | Local Tableau Extensions API SDK |

## Runtime Behavior

1. `tableau.extensions.initializeAsync()` connects to Tableau.
2. `worksheet.getVisualSpecificationAsync()` reads the mapped encoding fields.
3. `worksheet.getSummaryDataReaderAsync()` loads worksheet summary data.
4. `chart.js` supports both current visual-spec fields (`marksSpecifications`) and older sample-style fields (`marksSpecificationCollection`).
5. Required mappings are validated against the returned summary-data columns.
6. `Image URL` fields and `Value` fields are paired by their mapped order.
7. Every valid field pair on every returned data row becomes one card in the CSS grid.
8. If the mapped counts do not match, the extension renders valid pairs and ignores unpaired extra fields.
9. Tableau-formatted value text is rendered directly, so prefixes, suffixes, and number formatting are preserved.
10. Blank or broken image URLs show a neutral fallback icon.
11. `SummaryDataChanged` and `WorksheetFormattingChanged` trigger a full re-render.

## Card Count

Cards are dynamic: Tableau controls the source rows, and the extension renders cards from matched field pairs.

```text
visible card count = returned summary rows x matched Image URL / Value field pairs
```

Control the count in Tableau by mapping more or fewer `Image URL` / `Value` fields, filtering the worksheet, or changing the dimensions/aggregation so Tableau returns fewer or more rows.

The visual layout shows at most three cards per row on wide panes. The fourth card wraps to the next row.

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

- Drag `img_url_1`, `img_url_2`, etc. to the extension's `Image URL` encoding.
- Drag `img_val_1`, `img_val_2`, etc. or their aggregations to the extension's `Value` encoding.

The included data files can be used for a quick test:

```text
test-data/image-number-grid.xls
test-data/image-number-grid.csv
```

Use the CSV when you want all 15 field pairs immediately. Map `img_url_1` through `img_url_15` to `Image URL` and `img_val_1` through `img_val_15` to `Value`. To validate mismatch handling, map more image URL fields than value fields; the extension should render the matched pairs.

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
wc -l test-data/image-number-grid.csv
```

Expected result:

- `node --check` prints no syntax errors
- `xmllint` prints no XML errors
- `file` reports an XML document for the Excel-compatible `.xls` fixture
- `wc -l` reports 2 lines for the CSV: one header row plus one 15-pair data row

## Scope Limits

- No label/title field in v1
- No number abbreviation toggle
- No prefix/suffix controls
- No click-to-filter interaction
- No build tooling or package manager

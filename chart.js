'use strict';

const ENCODING_IMAGE = 'image';
const ENCODING_VALUE = 'value';
const PAGE_ROW_COUNT = 5000;

let activeWorksheet = null;
let renderRequestId = 0;

window.addEventListener('error', event => {
  renderEmptyState(event.message || 'Unexpected script error.', 'error', 'Script error');
});

window.addEventListener('unhandledrejection', event => {
  renderEmptyState(messageFromError(event.reason), 'error', 'Async error');
});

setStatus({
  state: 'loading',
  label: 'Initializing',
  detail: 'Connecting to Tableau...',
});
bootstrap();

function bootstrap() {
  if (!window.tableau?.extensions?.initializeAsync) {
    renderEmptyState('Tableau Extensions API is unavailable.', 'error', 'API unavailable');
    return;
  }

  tableau.extensions.initializeAsync().then(() => {
    activeWorksheet = tableau.extensions.worksheetContent?.worksheet;
    if (!activeWorksheet) {
      throw new Error('This Viz Extension must be loaded inside a Tableau worksheet.');
    }

    activeWorksheet.addEventListener(
      tableau.TableauEventType.SummaryDataChanged,
      () => render(activeWorksheet)
    );
    render(activeWorksheet);
  }).catch(err => {
    renderEmptyState(messageFromError(err), 'error', 'Initialization failed');
  });
}

async function render(worksheet) {
  const requestId = renderRequestId + 1;
  renderRequestId = requestId;

  clearError();
  renderEmptyGrid('Loading worksheet data...');
  setStatus({
    state: 'loading',
    label: 'Loading worksheet',
    detail: 'Reading mapped fields and summary data...',
  });

  try {
    const [vizSpec, dataTable] = await Promise.all([
      worksheet.getVisualSpecificationAsync(),
      fetchSummaryData(worksheet),
    ]);

    if (requestId !== renderRequestId) {
      return;
    }

    const diagnostics = getMappingDiagnostics(vizSpec, dataTable);

    if (diagnostics.issues.length) {
      renderEmptyGrid('Map both Image URL and Value fields to render the grid.');
      setStatus({
        state: 'warning',
        label: 'Needs mapping',
        detail: diagnostics.issues.join(' '),
        diagnostics,
        renderedRows: 0,
      });
      return;
    }

    if (!dataTable.data.length) {
      renderEmptyGrid('The mapped fields are valid, but Tableau returned no summary rows.');
      setStatus({
        state: 'warning',
        label: 'No data',
        detail: 'The mapped fields are valid, but Tableau returned no summary rows.',
        diagnostics,
        renderedRows: 0,
      });
      return;
    }

    const cards = parseCards(dataTable, diagnostics);
    renderGrid(cards, diagnostics, dataTable.data.length, requestId);
  } catch (err) {
    if (requestId === renderRequestId) {
      renderEmptyState(messageFromError(err), 'error', 'Error');
    }
  }
}

async function fetchSummaryData(worksheet) {
  const options = { ignoreSelection: true };
  if (tableau.IncludeDataValuesOption?.AllValues) {
    options.includeDataValuesOption = tableau.IncludeDataValuesOption.AllValues;
  }

  const reader = await worksheet.getSummaryDataReaderAsync(PAGE_ROW_COUNT, options);

  try {
    if (typeof reader.getAllPagesAsync === 'function') {
      return await reader.getAllPagesAsync();
    }

    const pageCount = reader.pageCount ?? 0;
    const pages = [];
    for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
      pages.push(await reader.getPageAsync(pageIndex));
    }

    return mergeDataPages(pages);
  } finally {
    await reader.releaseAsync();
  }
}

function getMappingDiagnostics(vizSpec, dataTable) {
  const marksSpec = getActiveMarksSpecification(vizSpec);
  if (!marksSpec) {
    throw new Error('No marks specification found.');
  }

  const imageField = getEncodingField(marksSpec, ENCODING_IMAGE);
  const valueField = getEncodingField(marksSpec, ENCODING_VALUE);
  const columns = dataTable.columns ?? [];
  const imageIndex = findColumnIndex(columns, imageField);
  const valueIndex = findColumnIndex(columns, valueField);

  const diagnostics = {
    imageField: getFieldLabel(imageField),
    valueField: getFieldLabel(valueField),
    imageState: imageField ? 'mapped' : 'missing',
    valueState: valueField ? 'mapped' : 'missing',
    imageIndex,
    valueIndex,
    issues: [],
  };

  if (!imageField) {
    diagnostics.issues.push('Image URL is not mapped.');
  } else if (imageIndex < 0) {
    diagnostics.imageState = 'missing-column';
    diagnostics.issues.push(`Image URL is mapped to "${diagnostics.imageField}", but that field is not in summary data.`);
  }

  if (!valueField) {
    diagnostics.issues.push('Value is not mapped.');
  } else if (valueIndex < 0) {
    diagnostics.valueState = 'missing-column';
    diagnostics.issues.push(`Value is mapped to "${diagnostics.valueField}", but that field is not in summary data.`);
  }

  return diagnostics;
}

function parseCards(dataTable, diagnostics) {
  return dataTable.data.map((row, rowIndex) => {
    const imageCell = row[diagnostics.imageIndex];
    const valueCell = row[diagnostics.valueIndex];
    const numericValue = toNumber(cellRawValue(valueCell) ?? cellDisplayValue(valueCell));

    return {
      rowNumber: rowIndex + 1,
      imageUrl: normalizeImageUrl(cellStringValue(imageCell)),
      value: numericValue,
    };
  });
}

function mergeDataPages(pages) {
  if (!pages.length) {
    return { columns: [], data: [] };
  }

  return {
    columns: pages[0].columns ?? [],
    data: pages.flatMap(page => page.data ?? []),
  };
}

function getActiveMarksSpecification(vizSpec) {
  const modernSpecs = vizSpec?.marksSpecifications;
  if (Array.isArray(modernSpecs) && modernSpecs.length) {
    const activeIndex = vizSpec.activeMarksSpecificationIndex ?? 0;
    return modernSpecs[activeIndex] ?? modernSpecs[0];
  }

  const legacySpecs = vizSpec?.marksSpecificationCollection;
  if (Array.isArray(legacySpecs) && legacySpecs.length) {
    return legacySpecs[0];
  }

  return null;
}

function getEncodingField(marksSpec, encodingId) {
  const modernEncoding = marksSpec.encodings?.find(
    encoding => normalizeToken(encoding?.id) === normalizeToken(encodingId)
  );
  if (modernEncoding?.field) {
    return modernEncoding.field;
  }

  const legacyEncoding = marksSpec.encodingCollection?.find(
    encoding => normalizeToken(encoding?.id) === normalizeToken(encodingId)
  );
  const legacyField = legacyEncoding?.fieldCollection?.[0];
  if (legacyField) {
    return {
      id: legacyField.fieldId,
      name: legacyField.fieldName,
      fieldName: legacyField.fieldName,
    };
  }

  return null;
}

function findColumnIndex(columns, field) {
  if (!field) {
    return -1;
  }

  const fieldTokens = [
    field.id,
    field.fieldId,
    field.name,
    field.fieldName,
  ].map(normalizeToken).filter(Boolean);

  for (let columnPosition = 0; columnPosition < columns.length; columnPosition += 1) {
    const column = columns[columnPosition];
    const columnTokens = [
      column?.fieldId,
      column?.fieldName,
      column?.name,
      column?.caption,
    ].map(normalizeToken).filter(Boolean);

    if (fieldTokens.some(token => columnTokens.includes(token))) {
      return columnPosition;
    }
  }

  return -1;
}

function getFieldLabel(field) {
  return field?.name ?? field?.fieldName ?? field?.id ?? field?.fieldId ?? null;
}

function normalizeToken(value) {
  return String(value ?? '').trim().toLowerCase();
}

function renderGrid(cards, diagnostics, rowCount, requestId) {
  const grid = document.getElementById('cardGrid');
  const emptyState = document.getElementById('emptyState');
  const fragment = document.createDocumentFragment();
  const imageStats = {
    blank: 0,
    broken: 0,
    loaded: 0,
    pending: 0,
    invalidValues: 0,
  };

  grid.replaceChildren();
  emptyState.hidden = true;

  cards.forEach(cardData => {
    const card = document.createElement('article');
    card.className = 'metric-card';
    card.setAttribute('aria-label', `Metric card ${cardData.rowNumber}`);

    const imageFrame = document.createElement('div');
    imageFrame.className = 'image-frame';

    const image = document.createElement('img');
    image.className = 'card-image';
    image.alt = '';
    image.decoding = 'async';
    image.loading = 'lazy';
    image.hidden = true;

    const placeholder = createImagePlaceholder();
    imageFrame.append(image, placeholder);

    const value = document.createElement('div');
    value.className = 'card-value';
    if (cardData.value === null) {
      value.classList.add('is-missing');
      value.textContent = '--';
      imageStats.invalidValues += 1;
    } else {
      value.textContent = formatNumber(cardData.value);
    }

    if (cardData.imageUrl) {
      imageStats.pending += 1;
      image.onload = () => {
        if (requestId !== renderRequestId) {
          return;
        }

        image.hidden = false;
        placeholder.hidden = true;
        imageStats.pending -= 1;
        imageStats.loaded += 1;
        updateGridStatus(cards.length, rowCount, diagnostics, imageStats);
      };
      image.onerror = () => {
        if (requestId !== renderRequestId) {
          return;
        }

        image.hidden = true;
        placeholder.hidden = false;
        image.removeAttribute('src');
        imageStats.pending -= 1;
        imageStats.broken += 1;
        updateGridStatus(cards.length, rowCount, diagnostics, imageStats);
      };
      image.src = cardData.imageUrl;
    } else {
      imageStats.blank += 1;
    }

    card.append(imageFrame, value);
    fragment.append(card);
  });

  grid.append(fragment);
  updateGridStatus(cards.length, rowCount, diagnostics, imageStats);
}

function updateGridStatus(cardCount, rowCount, diagnostics, imageStats) {
  const hasFallbacks = imageStats.blank > 0 || imageStats.broken > 0;
  const hasInvalidValues = imageStats.invalidValues > 0;
  const isLoadingImages = imageStats.pending > 0;
  const state = isLoadingImages ? 'loading' : (hasFallbacks || hasInvalidValues ? 'warning' : 'ready');
  const label = isLoadingImages ? 'Loading images' : (hasFallbacks ? 'Image fallback' : (hasInvalidValues ? 'Value fallback' : 'Ready'));
  const details = [
    `Rendering ${formatCount(cardCount, 'card')} from ${formatCount(rowCount, 'row')}.`,
  ];

  if (imageStats.pending > 0) {
    details.push(`${formatCount(imageStats.loaded, 'image')} loaded; ${formatCount(imageStats.pending, 'image')} still loading.`);
  }

  const fallbackCount = imageStats.blank + imageStats.broken;
  if (fallbackCount > 0) {
    details.push(`${formatCount(fallbackCount, 'image')} using fallback.`);
  }

  if (imageStats.invalidValues > 0) {
    details.push(`${formatCount(imageStats.invalidValues, 'value')} could not be parsed.`);
  }

  setStatus({
    state,
    label,
    detail: details.join(' '),
    diagnostics,
    renderedRows: cardCount,
  });
}

function createImagePlaceholder() {
  const template = document.getElementById('imagePlaceholderTemplate');
  return template.content.firstElementChild.cloneNode(true);
}

function renderEmptyState(message, state = 'error', label = 'Error') {
  renderEmptyGrid(message);
  setError(message);
  setStatus({
    state,
    label,
    detail: message,
    renderedRows: 0,
  });
}

function renderEmptyGrid(message) {
  document.getElementById('cardGrid').replaceChildren();
  const emptyState = document.getElementById('emptyState');
  emptyState.hidden = false;
  emptyState.textContent = message;
}

function cellRawValue(cell) {
  return cell?.value ?? cell?.nativeValue ?? null;
}

function cellDisplayValue(cell) {
  return cell?.formattedValue ?? cell?.value ?? cell?.nativeValue ?? '';
}

function cellStringValue(cell) {
  const candidates = [
    cell?.value,
    cell?.nativeValue,
    cell?.formattedValue,
  ];

  const stringValue = candidates.find(value => typeof value === 'string' && value.trim());
  if (stringValue) {
    return stringValue;
  }

  const fallback = candidates.find(value => value !== null && value !== undefined);
  return fallback ?? '';
}

function toNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.replace(/,/g, '').trim();
  if (!normalized || normalized.toLowerCase() === 'null') {
    return null;
  }

  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function normalizeImageUrl(value) {
  const url = String(value ?? '').trim();
  const normalized = url.toLowerCase();
  if (!url || normalized === 'null' || normalized === 'undefined' || normalized === 'nan' || normalized === '0') {
    return '';
  }

  return url;
}

function formatNumber(value) {
  const hasFraction = Math.abs(value % 1) > Number.EPSILON;
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: hasFraction ? 2 : 0,
  }).format(value);
}

function formatCount(count, singular) {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

function setStatus({ state = 'loading', label, detail, diagnostics = {}, renderedRows = 0 }) {
  const panel = document.getElementById('statusPanel');
  const labelEl = document.getElementById('statusLabel');
  const detailEl = document.getElementById('statusDetail');
  const rowEl = document.getElementById('rowMapping');

  if (!panel || !labelEl || !detailEl) {
    return;
  }

  panel.dataset.status = state;
  labelEl.textContent = label;
  detailEl.textContent = detail;

  setMappingText('imageMapping', diagnostics.imageField, diagnostics.imageState);
  setMappingText('valueMapping', diagnostics.valueField, diagnostics.valueState);

  if (rowEl) {
    rowEl.textContent = `${renderedRows} rendered`;
    rowEl.title = rowEl.textContent;
    rowEl.classList.toggle('is-missing', renderedRows === 0);
  }
}

function setMappingText(elementId, fieldName, state) {
  const element = document.getElementById(elementId);
  if (!element) {
    return;
  }

  let text = fieldName || 'Not mapped';
  if (state === 'missing-column') {
    text = `Missing in data: ${fieldName}`;
  }

  element.textContent = text;
  element.title = text;
  element.classList.toggle('is-missing', state !== 'mapped');
}

function messageFromError(err) {
  return err?.message || String(err);
}

function setError(message) {
  document.getElementById('error').textContent = message;
}

function clearError() {
  document.getElementById('error').textContent = '';
}

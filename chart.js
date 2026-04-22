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

    if (tableau.TableauEventType.WorksheetFormattingChanged) {
      activeWorksheet.addEventListener(
        tableau.TableauEventType.WorksheetFormattingChanged,
        () => render(activeWorksheet)
      );
    }

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
      renderEmptyGrid('Map at least one valid Image URL and Value field pair to render the grid.');
      return;
    }

    if (!dataTable.data.length) {
      renderEmptyGrid('The mapped fields are valid, but Tableau returned no summary rows.');
      return;
    }

    const allCards = parseCards(dataTable, diagnostics);
    const visibleCards = applyCardLimit(allCards);
    renderGrid(visibleCards, diagnostics, dataTable.data.length, allCards.length, requestId);
  } catch (err) {
    if (requestId === renderRequestId) {
      renderEmptyState(messageFromError(err), 'error', 'Error');
    }
  }
}

function applyCardLimit(cards) {
  return cards;
}

async function fetchSummaryData(worksheet) {
  const options = {
    ignoreSelection: true,
    applyWorksheetFormatting: true,
  };
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

  const imageFields = getEncodingFields(marksSpec, ENCODING_IMAGE);
  const valueFields = getEncodingFields(marksSpec, ENCODING_VALUE);
  const columns = dataTable.columns ?? [];
  const imageColumns = resolveEncodingColumns(columns, imageFields);
  const valueColumns = resolveEncodingColumns(columns, valueFields);
  const validImageColumns = imageColumns.filter(column => column.index >= 0);
  const validValueColumns = valueColumns.filter(column => column.index >= 0);
  const pairCount = Math.min(validImageColumns.length, validValueColumns.length);
  const pairs = Array.from({ length: pairCount }, (_unused, pairIndex) => ({
    pairNumber: pairIndex + 1,
    image: validImageColumns[pairIndex],
    value: validValueColumns[pairIndex],
  }));

  const diagnostics = {
    imageField: formatFieldSummary(imageFields),
    valueField: formatFieldSummary(valueFields),
    imageFieldTitle: formatFieldTitle(imageFields),
    valueFieldTitle: formatFieldTitle(valueFields),
    imageState: imageFields.length ? 'mapped' : 'missing',
    valueState: valueFields.length ? 'mapped' : 'missing',
    imageColumns,
    valueColumns,
    validImageCount: validImageColumns.length,
    validValueCount: validValueColumns.length,
    pairCount,
    pairs,
    issues: [],
    warnings: [],
  };

  if (!imageFields.length) {
    diagnostics.issues.push('Image URL is not mapped.');
  } else if (!validImageColumns.length) {
    diagnostics.imageState = 'missing-column';
    diagnostics.issues.push('Image URL fields are mapped, but none are in summary data.');
  } else if (validImageColumns.length < imageFields.length) {
    diagnostics.imageState = 'partial';
    diagnostics.warnings.push(`${formatCount(imageFields.length - validImageColumns.length, 'Image URL field')} missing from summary data.`);
  }

  if (!valueFields.length) {
    diagnostics.issues.push('Value is not mapped.');
  } else if (!validValueColumns.length) {
    diagnostics.valueState = 'missing-column';
    diagnostics.issues.push('Value fields are mapped, but none are in summary data.');
  } else if (validValueColumns.length < valueFields.length) {
    diagnostics.valueState = 'partial';
    diagnostics.warnings.push(`${formatCount(valueFields.length - validValueColumns.length, 'Value field')} missing from summary data.`);
  }

  if (!diagnostics.issues.length && pairCount === 0) {
    diagnostics.issues.push('No valid Image URL and Value field pairs were found.');
  }

  if (!diagnostics.issues.length && validImageColumns.length !== validValueColumns.length) {
    const extraImageCount = Math.max(0, validImageColumns.length - pairCount);
    const extraValueCount = Math.max(0, validValueColumns.length - pairCount);

    if (extraImageCount > 0) {
      diagnostics.imageState = 'partial';
      diagnostics.warnings.push(`${formatCount(extraImageCount, 'extra Image URL field')} ignored because it has no matching Value field.`);
    }

    if (extraValueCount > 0) {
      diagnostics.valueState = 'partial';
      diagnostics.warnings.push(`${formatCount(extraValueCount, 'extra Value field')} ignored because it has no matching Image URL field.`);
    }
  }

  return diagnostics;
}

function parseCards(dataTable, diagnostics) {
  return dataTable.data.flatMap((row, rowIndex) => (
    diagnostics.pairs.map(pair => {
      const imageCell = row[pair.image.index];
      const valueCell = row[pair.value.index];
      const valueText = cardValueText(valueCell);

      return {
        rowNumber: rowIndex + 1,
        pairNumber: pair.pairNumber,
        imageField: pair.image.label,
        valueField: pair.value.label,
        imageUrl: normalizeImageUrl(cellStringValue(imageCell)),
        valueText,
      };
    })
  ));
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

function getEncodingFields(marksSpec, encodingId) {
  const modernEncodings = marksSpec.encodings?.filter(
    encoding => normalizeToken(encoding?.id) === normalizeToken(encodingId)
  );
  if (Array.isArray(modernEncodings) && modernEncodings.length) {
    return dedupeFields(modernEncodings.flatMap(collectEncodingFields));
  }

  const legacyEncodings = marksSpec.encodingCollection?.filter(
    encoding => normalizeToken(encoding?.id) === normalizeToken(encodingId)
  );
  return Array.isArray(legacyEncodings) && legacyEncodings.length
    ? dedupeFields(legacyEncodings.flatMap(collectEncodingFields))
    : [];
}

function collectEncodingFields(encoding) {
  const fields = [];

  if (Array.isArray(encoding.fields)) {
    fields.push(...encoding.fields);
  }

  if (Array.isArray(encoding.field)) {
    fields.push(...encoding.field);
  } else if (encoding.field) {
    fields.push(encoding.field);
  }

  if (Array.isArray(encoding.fieldCollection)) {
    fields.push(...encoding.fieldCollection);
  }

  return dedupeFields(fields.map(normalizeEncodingField).filter(Boolean));
}

function normalizeEncodingField(field) {
  if (!field) {
    return null;
  }

  if (typeof field === 'string') {
    return {
      id: field,
      name: field,
      fieldName: field,
    };
  }

  return {
    ...field,
    id: field.id ?? field.fieldId,
    name: field.name ?? field.fieldName ?? field.fieldCaption,
    fieldName: field.fieldName ?? field.name ?? field.fieldCaption,
  };
}

function dedupeFields(fields) {
  const seen = new Set();
  return fields.filter(field => {
    const key = [
      field.id,
      field.fieldId,
      field.name,
      field.fieldName,
      field.fieldCaption,
    ].map(normalizeToken).find(Boolean);

    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function resolveEncodingColumns(columns, fields) {
  const usedIndexes = new Set();
  return fields.map(field => {
    const index = findColumnIndex(columns, field, usedIndexes);
    if (index >= 0) {
      usedIndexes.add(index);
    }

    return {
      field,
      label: getFieldLabel(field) || 'Unnamed field',
      index,
    };
  });
}

function findColumnIndex(columns, field, excludedIndexes = new Set()) {
  if (!field) {
    return -1;
  }

  const fieldTokens = [
    field.id,
    field.fieldId,
    field.name,
    field.fieldName,
    field.fieldCaption,
  ].map(normalizeToken).filter(Boolean);

  for (let columnPosition = 0; columnPosition < columns.length; columnPosition += 1) {
    if (excludedIndexes.has(columnPosition)) {
      continue;
    }

    const column = columns[columnPosition];
    const columnTokens = [
      column?.fieldId,
      column?.fieldName,
      column?.fieldCaption,
      column?.name,
      column?.caption,
    ].map(normalizeToken).filter(Boolean);

    if (fieldTokens.some(token => columnTokens.includes(token))) {
      return columnPosition;
    }
  }

  return -1;
}

function formatFieldSummary(fields) {
  if (!fields.length) {
    return null;
  }

  const labels = fields.map(field => getFieldLabel(field) || 'Unnamed field');
  const visibleLabels = labels.slice(0, 3).join(', ');
  const remainingCount = labels.length - 3;
  const suffix = remainingCount > 0 ? `, +${remainingCount} more` : '';
  return `${fields.length} mapped: ${visibleLabels}${suffix}`;
}

function formatFieldTitle(fields) {
  return fields.map(field => getFieldLabel(field) || 'Unnamed field').join(', ');
}

function getFieldLabel(field) {
  return field?.name ?? field?.fieldName ?? field?.fieldCaption ?? field?.id ?? field?.fieldId ?? null;
}

function normalizeToken(value) {
  return String(value ?? '').trim().toLowerCase();
}

function renderGrid(cards, diagnostics, rowCount, totalCardCount, requestId) {
  const grid = document.getElementById('cardGrid');
  const emptyState = document.getElementById('emptyState');
  const fragment = document.createDocumentFragment();

  grid.replaceChildren();
  emptyState.hidden = true;

  cards.forEach(cardData => {
    const card = document.createElement('article');
    card.className = 'metric-card';
    card.setAttribute(
      'aria-label',
      `Metric card ${cardData.pairNumber}: ${cardData.imageField} with ${cardData.valueField}`
    );

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
    if (!cardData.valueText) {
      value.classList.add('is-missing');
      value.textContent = '--';
    } else {
      value.textContent = cardData.valueText;
    }

    if (cardData.imageUrl) {
      image.onload = () => {
        if (requestId !== renderRequestId) {
          return;
        }

        image.hidden = false;
        placeholder.hidden = true;
      };
      image.onerror = () => {
        if (requestId !== renderRequestId) {
          return;
        }

        image.hidden = true;
        placeholder.hidden = false;
        image.removeAttribute('src');
      };
      image.src = cardData.imageUrl;
    }

    card.append(imageFrame, value);
    fragment.append(card);
  });

  grid.append(fragment);
}

function createImagePlaceholder() {
  const template = document.getElementById('imagePlaceholderTemplate');
  return template.content.firstElementChild.cloneNode(true);
}

function renderEmptyState(message, state = 'error', label = 'Error') {
  renderEmptyGrid(message);
  setError(message);
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

function cardValueText(cell) {
  const formattedValue = cleanDisplayValue(cell?.formattedValue);
  if (formattedValue) {
    return formattedValue;
  }

  const rawValue = cellRawValue(cell);
  if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
    return formatNumber(rawValue);
  }

  return cleanDisplayValue(cell?.value ?? cell?.nativeValue);
}

function cleanDisplayValue(value) {
  const text = String(value ?? '').trim();
  const normalized = text.toLowerCase();
  if (!text || normalized === 'null' || normalized === 'undefined' || normalized === 'nan') {
    return '';
  }

  return text;
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

function messageFromError(err) {
  return err?.message || String(err);
}

function setError(message) {
  document.getElementById('error').textContent = message;
}

function clearError() {
  document.getElementById('error').textContent = '';
}

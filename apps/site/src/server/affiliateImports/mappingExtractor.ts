import { JSDOM, VirtualConsole } from 'jsdom';
import {
  normalizeAffiliateEventDateTime,
  type AffiliateDateTimeNormalization,
} from './affiliateDateTime';
import type {
  AffiliateCandidateInput,
  AffiliateScrapeMapping,
  FieldMapping,
  ScrapedPage,
} from './types';

type ExtractedFieldName = keyof AffiliateScrapeMapping['fields'];
export type ExtractedAffiliateFieldValues = Record<string, string | null>;

const nullableFieldNames = [
  'organizerName',
  'sportName',
  'formatLabel',
  'city',
  'venueName',
  'address',
  'locationSource',
  'locationEvidence',
  'startsAt',
  'endsAt',
  'durationText',
  'timeZone',
  'scheduleText',
  'dateDisplayMode',
  'dateDisplayText',
  'skillLevel',
  'ageGroup',
  'divisionText',
  'maxParticipantsText',
  'currentParticipantsText',
  'spotsRemainingText',
  'participantOptionsText',
  'priceText',
  'statusText',
  'registrationDeadlineText',
  'sourceUrl',
  'description',
  'tagText',
] as const;

const createDom = (html: string, url: string): JSDOM => (
  new JSDOM(html, {
    url,
    virtualConsole: new VirtualConsole(),
  })
);

const normalizeWhitespace = (value: string): string => (
  value.replace(/\s+/g, ' ').trim()
);

const normalizeTagInputs = (value: unknown): string[] => {
  const rawValues = Array.isArray(value)
    ? value
    : (typeof value === 'string' ? value.split(/[,;|]/) : []);
  const seen = new Set<string>();
  const tags: string[] = [];
  rawValues.forEach((rawValue) => {
    if (typeof rawValue !== 'string') return;
    const tag = normalizeWhitespace(rawValue);
    if (!tag) return;
    const key = tag.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    tags.push(tag);
  });
  return tags;
};

const toAbsoluteUrl = (value: string, baseUrl: string): string => {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
};

const escapeRegExp = (value: string): string => (
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
);

const findTelerikPostBackUrl = (dom: Document, elementId: string, baseUrl: string): string | null => {
  const scripts = Array.from(dom.querySelectorAll('script'));
  const idPattern = escapeRegExp(elementId);
  const uniqueIdPattern = escapeRegExp(elementId.replace(/_/g, '$'));
  const buttonScript = scripts
    .map((script) => script.textContent ?? '')
    .find((text) => text.includes(elementId) || text.includes(uniqueIdPattern));
  if (!buttonScript) return null;

  const postBackPattern = new RegExp(
    `WebForm_DoPostBackWithOptions\\(new WebForm_PostBackOptions\\('(?:${idPattern}|${uniqueIdPattern})'[^)]*?,\\s*'([^']+)'`,
  );
  const match = buttonScript.match(postBackPattern);
  const rawUrl = match?.[1]?.replace(/\\\\u0026/g, '&');
  return rawUrl ? toAbsoluteUrl(rawUrl, baseUrl) : null;
};

const findNearestPreviousText = (element: Element, selector: string): string | null => {
  let current: Element | null = element;
  while (current) {
    let sibling = current.previousElementSibling;
    while (sibling) {
      if (sibling.matches(selector)) {
        return sibling.textContent ?? null;
      }
      const nestedMatches = Array.from(sibling.querySelectorAll(selector));
      const lastNestedMatch = nestedMatches[nestedMatches.length - 1];
      if (lastNestedMatch) {
        return lastNestedMatch.textContent ?? null;
      }
      sibling = sibling.previousElementSibling;
    }
    current = current.parentElement;
  }
  return null;
};

const selectElement = (root: Element, selector: string): Element | null => {
  const normalized = selector.trim();
  if (normalized === ':scope' || normalized === '&') {
    return root;
  }
  return root.querySelector(normalized);
};

const applyRegex = (value: string, pattern?: string): string => {
  if (!pattern) return value;
  const match = value.match(new RegExp(pattern, 'i'));
  if (!match) return '';
  return match[1] ?? match[0] ?? '';
};

const applyValueMap = (value: string, mapping: FieldMapping): string => {
  if (!mapping.valueMap) return value;
  const normalizedValue = normalizeWhitespace(value);
  const directMatch = mapping.valueMap[value] ?? mapping.valueMap[normalizedValue];
  if (directMatch != null) return directMatch;

  const lowerValue = normalizedValue.toLowerCase();
  const caseInsensitiveMatch = Object.entries(mapping.valueMap).find(([key]) => (
    normalizeWhitespace(key).toLowerCase() === lowerValue
  ));
  return caseInsensitiveMatch?.[1] ?? mapping.fallbackValue ?? '';
};

const normalizePriceTextValue = (value: string): string => {
  const normalized = normalizeWhitespace(value);
  if (!normalized) return '';
  if (normalized.includes('$')) return normalized;

  const numericAmount = normalized.match(/^([0-9][0-9,]*(?:\.[0-9]{1,2})?)$/);
  if (!numericAmount) return normalized;

  const amount = Number.parseFloat(numericAmount[1].replace(/,/g, ''));
  if (!Number.isFinite(amount)) return normalized;
  return `$${amount.toFixed(2)}`;
};

type LocationParts = {
  venueName: string | null;
  address: string | null;
  city: string | null;
};

const STREET_SUFFIX_PATTERN = [
  'Avenue',
  'Ave',
  'Boulevard',
  'Blvd',
  'Circle',
  'Cir',
  'Court',
  'Ct',
  'Drive',
  'Dr',
  'Lane',
  'Ln',
  'Loop',
  'Parkway',
  'Pkwy',
  'Place',
  'Pl',
  'Road',
  'Rd',
  'Street',
  'St',
  'Way',
].join('|');

const normalizeLocationCity = (value: string | null): string | null => {
  if (!value) return null;
  const city = normalizeWhitespace(value.replace(/\b(?:OR|Oregon|USA|United States)\b\.?/gi, '')).replace(/,\s*$/, '');
  return city.length > 0 ? city : null;
};

const findLastStreetMatch = (value: string): RegExpMatchArray | undefined => {
  const streetPattern = new RegExp(
    `\\b(\\d{1,6}\\s+(?:(?:N|NE|NW|S|SE|SW|E|W)\\s+)?[A-Za-z0-9 ']+?\\b(?:${STREET_SUFFIX_PATTERN})(?:\\s*-\\s*[A-Za-z][A-Za-z .]+|\\s+[A-Za-z][A-Za-z .]+)?)`,
    'gi',
  );
  const streetMatches = Array.from(value.matchAll(streetPattern));
  return streetMatches[streetMatches.length - 1];
};

const extractVenueName = (normalized: string, streetIndex: number): string | null => {
  const venueText = normalized.slice(0, streetIndex).replace(/\s*-\s*$/, '').replace(/[.\s]+$/, '');
  const sentenceParts = venueText.split(/\.\s*/).map(normalizeWhitespace).filter(Boolean);
  const venueSentence = sentenceParts[sentenceParts.length - 1] ?? venueText;
  const venueDashParts = venueSentence.split(/\s*-\s*/).map(normalizeWhitespace).filter(Boolean);
  return venueDashParts[venueDashParts.length - 1]?.replace(/^\d{1,2}:\d{2}\s*[AP]M\s*-\s*/i, '') ?? null;
};

const splitStreetAndCity = (value: string): { street: string; city: string | null } => {
  let street = normalizeWhitespace(value);
  const dashCity = street.match(/^(.*?)\s*-\s*([A-Za-z][A-Za-z .]+)$/);
  if (dashCity?.[1] && dashCity[2]) {
    return {
      street: normalizeWhitespace(dashCity[1]),
      city: normalizeLocationCity(dashCity[2]),
    };
  }

  const suffixCityPattern = new RegExp(`^(.*\\b(?:${STREET_SUFFIX_PATTERN})\\b)\\s+([A-Za-z][A-Za-z .]+)$`, 'i');
  const suffixCity = street.match(suffixCityPattern);
  if (suffixCity?.[1] && suffixCity[2]) {
    street = normalizeWhitespace(suffixCity[1]);
    return {
      street,
      city: normalizeLocationCity(suffixCity[2]),
    };
  }

  return { street, city: null };
};

const formatLocationCity = (city: string): string => (
  `${city}${/\b(?:OR|Oregon)\b/i.test(city) ? '' : ', OR'}`
);

const formatLocationParts = (
  venueName: string | null,
  street: string,
  city: string | null,
): LocationParts => {
  const formattedCity = city ? formatLocationCity(city) : null;
  return {
    venueName: venueName && venueName.length > 0 ? venueName : null,
    address: formattedCity ? `${street}, ${formattedCity}` : street,
    city: formattedCity,
  };
};

export const parseVenueAddressFromLocationText = (value: string): LocationParts => {
  const normalized = normalizeWhitespace(value.replace(/[–—]/g, '-'));
  const streetMatch = findLastStreetMatch(normalized);
  if (!streetMatch?.[1] || streetMatch.index == null) {
    return { venueName: null, address: null, city: null };
  }

  const venueName = extractVenueName(normalized, streetMatch.index);
  const location = splitStreetAndCity(streetMatch[1]);
  return formatLocationParts(venueName, location.street, location.city);
};

const cloneElementWithoutExcludedSelectors = (element: Element, mapping: FieldMapping): Element => {
  if (!mapping.excludeSelectors?.length) return element;
  const clone = element.cloneNode(true) as Element;
  mapping.excludeSelectors.forEach((selector) => {
    clone.querySelectorAll(selector).forEach((excludedElement) => excludedElement.remove());
  });
  return clone;
};

const textContentWithBlockSpacing = (element: Element): string => {
  const clone = element.cloneNode(true) as Element;
  clone.querySelectorAll('br, p, li, div, ul, ol, section, article, tr').forEach((blockElement) => {
    blockElement.appendChild(clone.ownerDocument.createTextNode(' '));
  });
  return clone.textContent ?? '';
};

const extractElementValue = (
  element: Element,
  mapping: FieldMapping,
  baseUrl: string,
): string => {
  const contentElement = cloneElementWithoutExcludedSelectors(element, mapping);
  if (mapping.transform === 'telerikPostBackUrl') {
    const ownerDocument = element.ownerDocument;
    const elementId = element.getAttribute('id') ?? '';
    return elementId ? findTelerikPostBackUrl(ownerDocument, elementId, baseUrl) ?? '' : '';
  }
  if (mapping.mode === 'attribute') {
    return mapping.attribute ? element.getAttribute(mapping.attribute) ?? '' : '';
  }
  if (mapping.mode === 'html') {
    return contentElement.innerHTML;
  }
  return textContentWithBlockSpacing(contentElement);
};

const extractRawFieldValue = (
  root: Element,
  mapping: FieldMapping,
  baseUrl: string,
): string | null => {
  if (mapping.mode === 'literal') {
    return mapping.value ?? '';
  }
  const element = selectElement(root, mapping.selector);
  if (!element) return null;
  return extractElementValue(element, mapping, baseUrl);
};

const isDateTimeTransform = (transform: FieldMapping['transform']): boolean => (
  transform === 'dateTime'
  || transform === 'dateRangeEnd'
  || transform === 'previousDaySectionDateTime'
);

const applyLocationTransform = (
  value: string,
  transform: FieldMapping['transform'],
): string | null => {
  if (transform === 'venueFromLocationText') {
    return parseVenueAddressFromLocationText(value).venueName ?? '';
  }
  if (transform === 'addressFromLocationText') {
    return parseVenueAddressFromLocationText(value).address ?? '';
  }
  if (transform === 'cityFromLocationText') {
    return parseVenueAddressFromLocationText(value).city ?? '';
  }
  return null;
};

const applyFieldTransform = (
  value: string,
  mapping: FieldMapping,
  baseUrl: string,
): string => {
  const transform = mapping.transform ?? 'trim';
  if (isDateTimeTransform(transform)) {
    return normalizeWhitespace(value);
  }
  if (transform === 'absoluteUrl') {
    return toAbsoluteUrl(normalizeWhitespace(value), baseUrl);
  }
  if (transform === 'priceText') {
    return normalizePriceTextValue(value);
  }
  return applyLocationTransform(value, transform) ?? normalizeWhitespace(value);
};

const extractFieldValue = (
  root: Element,
  mapping: FieldMapping,
  baseUrl: string,
  referenceDate: Date,
): string | null => {
  const rawValue = extractRawFieldValue(root, mapping, baseUrl);
  if (rawValue == null) return null;

  const value = applyValueMap(applyRegex(rawValue, mapping.regex), mapping);
  if (normalizeWhitespace(value).length === 0) {
    return null;
  }

  const transformedValue = applyFieldTransform(value, mapping, baseUrl);
  return transformedValue.length > 0 ? transformedValue : null;
};

const resolveExtractedStartSource = (
  rawStartsAt: string | null,
  startMapping: FieldMapping | undefined,
  startElement: Element | null | undefined,
): string | null => {
  if (startMapping?.transform !== 'previousDaySectionDateTime' || !startElement || !rawStartsAt) {
    return rawStartsAt;
  }
  const dayText = findNearestPreviousText(startElement, '.day-section');
  return dayText ? `${dayText} ${rawStartsAt}` : rawStartsAt;
};

const applyNormalizedExtractedDateTimeFields = (
  fieldValues: Partial<Record<ExtractedFieldName, string | null>>,
  rawStartsAt: string | null,
  rawEndsAt: string | null,
  rawTimeZone: string | null,
  normalized: AffiliateDateTimeNormalization,
): void => {
  if (rawStartsAt) fieldValues.startsAt = normalized.startsAt;
  if (normalized.endsAt || rawEndsAt) {
    fieldValues.endsAt = normalized.endsAt;
  }
  if (rawTimeZone) fieldValues.timeZone = normalized.metadata.timeZone;
  if (normalized.dateDisplayMode) fieldValues.dateDisplayMode = normalized.dateDisplayMode;
};

const normalizeExtractedDateTimeFields = (params: {
  fieldValues: Partial<Record<ExtractedFieldName, string | null>>;
  fieldMappings: AffiliateScrapeMapping['fields'];
  fieldElements: Partial<Record<ExtractedFieldName, Element | null>>;
  referenceDate: Date;
}) => {
  const { fieldValues, fieldMappings, fieldElements, referenceDate } = params;
  const {
    startsAt: rawStartsAt = null,
    endsAt: rawEndsAt = null,
    durationText: rawDurationText = null,
    timeZone: rawTimeZone = null,
    dateDisplayMode = null,
  } = fieldValues;
  const startSource = resolveExtractedStartSource(
    rawStartsAt,
    fieldMappings.startsAt,
    fieldElements.startsAt,
  );
  const normalized = normalizeAffiliateEventDateTime({
    startsAt: startSource,
    endsAt: rawEndsAt,
    durationText: rawDurationText,
    timeZone: rawTimeZone,
    dateDisplayMode,
    referenceDate,
  });

  applyNormalizedExtractedDateTimeFields(
    fieldValues,
    rawStartsAt,
    rawEndsAt,
    rawTimeZone,
    normalized,
  );

  return {
    normalized,
    dateTimeInputs: {
      startsAt: startSource,
      endsAt: rawEndsAt,
      durationText: rawDurationText,
      timeZone: rawTimeZone,
      dateDisplayMode: fieldValues.dateDisplayMode ?? null,
    },
  };
};

const isStaleMissingTimeZoneWarning = (warning: string): boolean => (
  warning === 'timeZone:MISSING_IANA_TIME_ZONE'
  || warning === 'start:MISSING_TIME_ZONE'
  || warning === 'end:MISSING_TIME_ZONE'
);

const recordValue = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const stringOrNull = (value: unknown): string | null => (
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
);

/**
 * Re-run datetime normalization after the service resolves a candidate's
 * venue or source-organization coordinates to an IANA timezone.
 */
export type AffiliateCandidateDateTimeInput = Omit<
  AffiliateCandidateInput,
  'startsAt' | 'endsAt'
> & {
  startsAt?: string | Date | null;
  endsAt?: string | Date | null;
};

type AffiliateCandidateDateTimeParams = {
  timeZone?: string | null;
  timeZoneEvidence?: 'SOURCE_FIELD' | 'COORDINATES';
  referenceDate: Date;
  dateTimeInputs?: Record<string, unknown>;
};

type CandidateDateTimeValues = {
  startsAt: string | null;
  endsAt: string | null;
  durationText: string | null;
  dateDisplayMode: string | null;
  timeZone: string | null;
};

const hasRecordKey = (
  records: ReadonlyArray<Record<string, unknown>>,
  fieldName: string,
): boolean => {
  for (const record of records) {
    if (Object.prototype.hasOwnProperty.call(record, fieldName)) return true;
  }
  return false;
};

const selectDateTimeInputValue = (
  overrides: Record<string, unknown>,
  fieldName: string,
  fallback: unknown,
): unknown => {
  if (Object.prototype.hasOwnProperty.call(overrides, fieldName)) {
    return overrides[fieldName];
  }
  return fallback;
};

const resolveCandidateDateTimeValues = (
  candidate: AffiliateCandidateDateTimeInput,
  params: AffiliateCandidateDateTimeParams,
  dateTimeInputs: Record<string, unknown>,
  rawExtractedFields: Record<string, unknown>,
  overrides: Record<string, unknown>,
): CandidateDateTimeValues => ({
  startsAt: stringOrNull(selectDateTimeInputValue(
    overrides,
    'startsAt',
    dateTimeInputs.startsAt ?? rawExtractedFields.startsAt,
  )),
  endsAt: stringOrNull(selectDateTimeInputValue(
    overrides,
    'endsAt',
    dateTimeInputs.endsAt ?? rawExtractedFields.endsAt,
  )),
  durationText: stringOrNull(selectDateTimeInputValue(
    overrides,
    'durationText',
    dateTimeInputs.durationText ?? rawExtractedFields.durationText,
  )),
  dateDisplayMode: stringOrNull(selectDateTimeInputValue(
    overrides,
    'dateDisplayMode',
    dateTimeInputs.dateDisplayMode ?? candidate.dateDisplayMode,
  )),
  timeZone: stringOrNull(selectDateTimeInputValue(
    overrides,
    'timeZone',
    params.timeZone ?? candidate.timeZone,
  )),
});

const resolveCandidateTimeZoneEvidence = (
  params: AffiliateCandidateDateTimeParams,
  existingDateTimeMetadata: Record<string, unknown>,
): 'SOURCE_FIELD' | 'COORDINATES' => {
  if (params.timeZoneEvidence != null) return params.timeZoneEvidence;
  if (existingDateTimeMetadata.timeZoneEvidence === 'COORDINATES') return 'COORDINATES';
  return params.timeZone ? 'COORDINATES' : 'SOURCE_FIELD';
};

const buildNormalizedCandidate = <Candidate extends AffiliateCandidateDateTimeInput>(
  candidate: Candidate,
  rawPayload: Record<string, unknown>,
  dateTimeInputs: Record<string, unknown>,
  overrides: Record<string, unknown>,
  values: CandidateDateTimeValues,
  normalized: AffiliateDateTimeNormalization,
): Candidate => ({
  ...candidate,
  timeZone: normalized.metadata.timeZone,
  warnings: [
    ...(candidate.warnings ?? []).filter((warning) => !isStaleMissingTimeZoneWarning(warning)),
    ...normalized.metadata.warnings,
  ],
  rawPayload: {
    ...rawPayload,
    dateTimeInputs: {
      ...dateTimeInputs,
      ...overrides,
    },
    extractedFields: {
      ...recordValue(rawPayload.extractedFields),
      startsAt: normalized.startsAt,
      endsAt: normalized.endsAt,
      durationText: values.durationText,
      timeZone: normalized.metadata.timeZone,
      dateDisplayMode: normalized.dateDisplayMode,
    },
    normalizedImport: {
      ...recordValue(rawPayload.normalizedImport),
      dateTime: normalized.metadata,
    },
  },
} as Candidate);

const applyNormalizedCandidateDateTimeFields = <Candidate extends AffiliateCandidateDateTimeInput>(
  candidate: Candidate,
  normalized: AffiliateDateTimeNormalization,
  inputRecords: ReadonlyArray<Record<string, unknown>>,
): Candidate => {
  if (hasRecordKey(inputRecords, 'startsAt')) candidate.startsAt = normalized.startsAt;
  if (hasRecordKey(inputRecords, 'startsAt') || hasRecordKey(inputRecords, 'endsAt')) {
    candidate.endsAt = normalized.endsAt;
  }
  if (normalized.dateDisplayMode) candidate.dateDisplayMode = normalized.dateDisplayMode;
  return candidate;
};

export const normalizeAffiliateCandidateDateTime = <
  Candidate extends AffiliateCandidateDateTimeInput,
>(
  candidate: Candidate,
  params: AffiliateCandidateDateTimeParams,
): Candidate => {
  const rawPayload = recordValue(candidate.rawPayload);
  const dateTimeInputs = recordValue(rawPayload.dateTimeInputs);
  const rawExtractedFields = recordValue(rawPayload.rawExtractedFields);
  const overrides = params.dateTimeInputs ?? {};
  const inputRecords = [overrides, dateTimeInputs, rawExtractedFields];
  const values = resolveCandidateDateTimeValues(
    candidate,
    params,
    dateTimeInputs,
    rawExtractedFields,
    overrides,
  );
  const existingDateTimeMetadata = recordValue(recordValue(rawPayload.normalizedImport).dateTime);
  const timeZoneEvidence = resolveCandidateTimeZoneEvidence(params, existingDateTimeMetadata);
  const normalized = normalizeAffiliateEventDateTime({
    ...values,
    timeZoneEvidence,
    referenceDate: params.referenceDate,
  });
  const nextCandidate = buildNormalizedCandidate(
    candidate,
    rawPayload,
    dateTimeInputs,
    overrides,
    values,
    normalized,
  );
  return applyNormalizedCandidateDateTimeFields(nextCandidate, normalized, inputRecords);
};

type ManualAffiliateCandidate = NonNullable<AffiliateScrapeMapping['manualCandidates']>[number];

const createManualDateTimeInputs = (
  manualCandidate: ManualAffiliateCandidate,
): {
  startsAt: string | null;
  endsAt: string | null;
  durationText: string | null;
  timeZone: string | null;
  dateDisplayMode: string | null;
} => {
  const {
    startsAt = null,
    endsAt = null,
    durationText = null,
    timeZone = null,
    dateDisplayMode = null,
  } = manualCandidate;
  return {
    startsAt,
    endsAt,
    durationText,
    timeZone,
    dateDisplayMode,
  };
};

const addManualCandidateFields = (
  candidate: AffiliateCandidateInput,
  manualCandidate: ManualAffiliateCandidate,
): void => {
  nullableFieldNames.forEach((fieldName) => {
    const value = manualCandidate[fieldName as keyof typeof manualCandidate];
    if (typeof value === 'string' && value.trim().length > 0) {
      candidate[fieldName] = value.trim();
    }
  });
  if (Array.isArray(manualCandidate.sportNames)) {
    candidate.sportNames = manualCandidate.sportNames.map((value) => value.trim()).filter(Boolean);
  }
};

const normalizeManualCandidateDateTime = (
  candidate: AffiliateCandidateInput,
  manualCandidate: ManualAffiliateCandidate,
  fetchedAt: string,
): AffiliateCandidateInput => {
  const dateTimeInputs = createManualDateTimeInputs(manualCandidate);
  const normalizedDateTime = normalizeAffiliateEventDateTime({
    ...dateTimeInputs,
    referenceDate: new Date(fetchedAt),
  });
  if (manualCandidate.startsAt != null) candidate.startsAt = normalizedDateTime.startsAt;
  if (manualCandidate.endsAt != null || normalizedDateTime.endsAt != null) {
    candidate.endsAt = normalizedDateTime.endsAt;
  }
  if (manualCandidate.timeZone != null) candidate.timeZone = normalizedDateTime.metadata.timeZone;
  if (normalizedDateTime.dateDisplayMode) candidate.dateDisplayMode = normalizedDateTime.dateDisplayMode;
  candidate.warnings = [...(candidate.warnings ?? []), ...normalizedDateTime.metadata.warnings];
  const rawPayload = candidate.rawPayload as Record<string, unknown>;
  rawPayload.normalizedImport = {
    dateTime: normalizedDateTime.metadata,
  };
  rawPayload.dateTimeInputs = {
    ...dateTimeInputs,
  };
  return candidate;
};

const createManualCandidate = (
  manualCandidate: ManualAffiliateCandidate,
  mapping: AffiliateScrapeMapping,
  baseUrl: string,
  index: number,
  fetchedAt: string,
): AffiliateCandidateInput => {
  const dateTimeInputs = createManualDateTimeInputs(manualCandidate);
  const candidate: AffiliateCandidateInput = {
    listingKind: manualCandidate.listingKind ?? mapping.kind,
    title: manualCandidate.title,
    officialActionUrl: toAbsoluteUrl(manualCandidate.officialActionUrl, baseUrl),
    sourceUrl: toAbsoluteUrl(manualCandidate.sourceUrl ?? manualCandidate.officialActionUrl, baseUrl),
    tags: normalizeTagInputs(manualCandidate.tags ?? manualCandidate.tagText),
    tagText: manualCandidate.tagText ?? null,
    rawPayload: {
      sourceIndex: index,
      manualSummaryCandidate: true,
      extractedFields: manualCandidate,
      dateTimeInputs,
      tags: normalizeTagInputs(manualCandidate.tags ?? manualCandidate.tagText),
    },
    warnings: manualCandidate.warnings ?? [],
  };

  addManualCandidateFields(candidate, manualCandidate);
  return normalizeManualCandidateDateTime(candidate, manualCandidate, fetchedAt);
};

export const extractAffiliateCandidatesFromPage = (
  page: ScrapedPage,
  mapping: AffiliateScrapeMapping,
): AffiliateCandidateInput[] => {
  const baseUrl = page.finalUrl || page.url;
  if (mapping.manualCandidates?.length) {
    return mapping.manualCandidates.map((manualCandidate, index) => (
      createManualCandidate(manualCandidate, mapping, baseUrl, index, page.fetchedAt)
    ));
  }

  const dom = createDom(page.body, page.finalUrl || page.url);
  const referenceDate = new Date(page.fetchedAt);
  const effectiveReferenceDate = Number.isNaN(referenceDate.getTime()) ? new Date() : referenceDate;
  const requiredIncludes = (mapping.itemTextIncludes ?? []).map((value) => normalizeWhitespace(value).toLowerCase());
  const requiredExcludes = (mapping.itemTextExcludes ?? []).map((value) => normalizeWhitespace(value).toLowerCase());
  const itemElements = Array.from(dom.window.document.querySelectorAll(mapping.itemSelector))
    .filter((element) => {
      const itemText = normalizeWhitespace(element.textContent ?? '').toLowerCase();
      return requiredIncludes.every((needle) => itemText.includes(needle))
        && !requiredExcludes.some((needle) => itemText.includes(needle));
    });

  return itemElements
    .map((element, index): AffiliateCandidateInput | null => {
      const warnings: string[] = [];
      const fieldValues: Partial<Record<ExtractedFieldName, string | null>> = {};
      const fieldElements: Partial<Record<ExtractedFieldName, Element | null>> = {};

      for (const [fieldName, fieldMapping] of Object.entries(mapping.fields) as Array<[ExtractedFieldName, FieldMapping]>) {
        const value = extractFieldValue(element, fieldMapping, baseUrl, effectiveReferenceDate);
        if (!value && fieldMapping.required) {
          warnings.push(`Missing required field: ${fieldName}`);
        }
        fieldValues[fieldName] = value;
        fieldElements[fieldName] = selectElement(element, fieldMapping.selector);
      }

      const rawFieldValues = { ...fieldValues };
      const dateTimeResult = normalizeExtractedDateTimeFields({
        fieldValues,
        fieldMappings: mapping.fields,
        fieldElements,
        referenceDate: effectiveReferenceDate,
      });
      warnings.push(...dateTimeResult.normalized.metadata.warnings);

      const title = fieldValues.title;
      const officialActionUrl = fieldValues.officialActionUrl;
      if (!title || !officialActionUrl) {
        return null;
      }

      const sourceUrl = fieldValues.sourceUrl || officialActionUrl || page.url;
      const candidate: AffiliateCandidateInput = {
        listingKind: mapping.kind,
        title,
        officialActionUrl,
        sourceUrl,
        tags: normalizeTagInputs(fieldValues.tagText),
        tagText: fieldValues.tagText ?? null,
        rawPayload: {
          sourceIndex: index,
          extractedFields: fieldValues,
          rawExtractedFields: rawFieldValues,
          dateTimeInputs: dateTimeResult.dateTimeInputs,
          normalizedImport: {
            dateTime: dateTimeResult.normalized.metadata,
          },
          tags: normalizeTagInputs(fieldValues.tagText),
        },
        warnings,
      };

      nullableFieldNames.forEach((fieldName) => {
        const value = fieldValues[fieldName];
        if (value) {
          candidate[fieldName] = value;
        }
      });
      const sportNamesValue = fieldValues.sportNames;
      if (sportNamesValue) {
        candidate.sportNames = sportNamesValue
          .split(/[,;|]/)
          .map((value) => normalizeWhitespace(value))
          .filter(Boolean);
      }

      return candidate;
    })
    .filter((candidate): candidate is AffiliateCandidateInput => Boolean(candidate));
};

export const extractAffiliateFieldValuesFromPage = (
  page: ScrapedPage,
  fields: Record<string, FieldMapping>,
): ExtractedAffiliateFieldValues => {
  const baseUrl = page.finalUrl || page.url;
  const dom = createDom(page.body, baseUrl);
  const referenceDate = new Date(page.fetchedAt);
  const effectiveReferenceDate = Number.isNaN(referenceDate.getTime()) ? new Date() : referenceDate;
  const root = dom.window.document.documentElement;
  const fieldValues: ExtractedAffiliateFieldValues = {};

  for (const [fieldName, fieldMapping] of Object.entries(fields)) {
    fieldValues[fieldName] = extractFieldValue(root, fieldMapping, baseUrl, effectiveReferenceDate);
  }

  return fieldValues;
};

import {
  createAffiliateMappingDom,
  selectAffiliateMappingElement,
  selectAffiliateMappingItems,
} from './mappingExtractor';
import { AFFILIATE_PUBLIC_ACTION_PATTERN } from './sourceDiscoveryRules';
import type {
  AffiliateCandidateInput,
  AffiliateScrapeMapping,
  FieldMapping,
  ScrapedPage,
} from './types';

export type AffiliateEntityActionSourceDocumentKind = 'ARTICLE' | 'OTHER' | 'UNKNOWN';

export type AffiliateEntityActionQualityIssue = {
  code: string;
  candidateIndex: number | null;
  message: string;
};

export type AffiliateEntityActionQualityReport = {
  schemaVersion: 1;
  isValid: boolean;
  sourceDocumentKind: AffiliateEntityActionSourceDocumentKind;
  issues: readonly AffiliateEntityActionQualityIssue[];
};

type JsonRecord = Record<string, unknown>;
type ActionEvidence = {
  element: Element | null;
  rawValue: string | null;
};

const MAX_ISSUES = 64;
const MAX_MESSAGE_LENGTH = 240;
const MAX_CANDIDATES = 1_000;
const MAX_CANDIDATE_TITLE_LENGTH = 512;
const MAX_ACTION_LABEL_LENGTH = 512;
const MAX_CONTEXT_DOM_NODES = 128;
const MAX_CONTEXT_TEXT_LENGTH = 1_024;
const RELATED_SCOPE_SELECTOR = [
  'aside.read-more-wrap',
  'aside[class~="related"]',
  'aside[class^="related-"]',
  'aside[class*=" related-"]',
  '[class~="related"]',
  '[class^="related-"]',
  '[class*=" related-"]',
  '[id="related"]',
  '[id^="related-"]',
  '[class~="read-more"]',
  '[class~="recommended"]',
  '[class^="recommended-"]',
  '[class*=" recommended-"]',
  '[id="recommended"]',
  '[id^="recommended-"]',
  '[class~="recommendations"]',
  '[class^="recommendations-"]',
  '[class*=" recommendations-"]',
  '[id="recommendations"]',
  '[id^="recommendations-"]',
  '[class^="read-more-"]',
  '[class*=" read-more-"]',
  '[id="read-more"]',
  '[id^="read-more-"]',
  '[class~="post-card"]',
  '[class^="post-card-"]',
  '[class*=" post-card-"]',
  '[class~="relatedStories"]',
  '[class~="related-stories"]',
  '[aria-label*="related"]',
  '[aria-label*="Related"]',
  '[aria-label*="recommended"]',
  '[aria-label*="Recommended"]',
].join(',');
const NAVIGATION_CONTAINER_TOKEN_PATTERN = /^(?:(?:main|primary|secondary|site|global|header|footer|mobile|desktop)-)?navigation(?:-menu)?$/i;
const ACTION_PATH_PATTERN = /(?:^|[/.#_?&=-])(?:register|registration|membership|member|join|sign[-_ ]?up|try[-_ ]?out|book|booking|reserve|reservation|enroll|enrollment|apply|application)(?:$|[/.#_?&=-])/i;
const EDITORIAL_ACTION_PATH_PATTERN = /(?:^|\/)(?:news|article|articles|story|stories|blog|blogs|press|post|posts)(?:\/|$)/i;
const OFFICIAL_INFORMATION_PATH_PATTERN = /(?:^|\/)(?:about(?:-us)?|contact(?:-us)?|program(?:s)?|team(?:s)?|roster|facilit(?:y|ies)|location(?:s)?|schedule|information|info|home)(?:\/|$)/i;
const OFFICIAL_INFORMATION_LABEL_PATTERN = /\b(?:official(?:\s+(?:site|website|page))?|website|homepage|home|about|program(?:s)?|team(?:s)?|roster|contact|location(?:s)?|facilit(?:y|ies)|information|info|details?|learn\s+more|more\s+info)\b/i;
const MEMBERSHIP_ACTION_PATTERN = /\b(?:member(?:ship)?|enroll(?:ment)?|apply|application)\b/i;
const ARTICLE_TYPE_PATTERN = /^(?:article|newsarticle|blogposting)$/i;
const OTHER_DOCUMENT_TYPE_PATTERN = /^(?:website|webpage|profilepage|collectionpage|itemlist|searchresults?page)$/i;
const ORGANIZATION_TYPE_PATTERN = /^(?:organization|sportsorganization|sportsteam)$/i;

const normalizeWhitespace = (value: string): string => value.replace(/\s+/g, ' ').trim();

const normalizedLower = (value: string): string => normalizeWhitespace(value).toLowerCase();

const asRecord = (value: unknown): JsonRecord | null => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null
);

const stringValue = (value: unknown): string | null => (
  typeof value === 'string' && normalizeWhitespace(value)
    ? normalizeWhitespace(value)
    : null
);

const boundedMessage = (message: string): string => message.length <= MAX_MESSAGE_LENGTH
  ? message
  : `${message.slice(0, MAX_MESSAGE_LENGTH - 1)}…`;

const inputTooLargeReport = (
  sourceDocumentKind: AffiliateEntityActionSourceDocumentKind,
  candidateIndex: number | null,
  message: string,
): AffiliateEntityActionQualityReport => ({
  schemaVersion: 1,
  isValid: false,
  sourceDocumentKind,
  issues: [{
    code: 'INPUT_TOO_LARGE',
    candidateIndex,
    message: boundedMessage(message),
  }],
});

const normalizeComparableUrl = (
  value: string,
  baseUrl: string | undefined,
  preserveFragment: boolean,
): string | null => {
  try {
    const parsed = new URL(value, baseUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (!preserveFragment) parsed.hash = '';
    parsed.hostname = parsed.hostname.toLowerCase();
    if ((parsed.protocol === 'http:' && parsed.port === '80')
      || (parsed.protocol === 'https:' && parsed.port === '443')) {
      parsed.port = '';
    }
    if (parsed.pathname.length > 1) parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    return parsed.toString();
  } catch {
    return null;
  }
};

const canonicalDocumentIdentityUrl = (value: string, baseUrl?: string): string | null => (
  normalizeComparableUrl(value, baseUrl, false)
);

const canonicalActionDestinationUrl = (value: string, baseUrl?: string): string | null => (
  normalizeComparableUrl(value, baseUrl, true)
);

const valueFromMappingElement = (
  element: Element | null,
  fieldMapping: FieldMapping | undefined,
): string | null => {
  if (!element || !fieldMapping) return null;
  if (fieldMapping.mode === 'attribute') {
    const attribute = fieldMapping.attribute;
    return attribute ? element.getAttribute(attribute) : null;
  }
  if (fieldMapping.mode === 'html') return element.innerHTML;
  return element.textContent;
};

const mappedActionValue = (
  rawValue: string | null,
  fieldMapping: FieldMapping | undefined,
  baseUrl: string,
): string | null => {
  if (rawValue == null || !fieldMapping) return null;
  let value = rawValue;
  if (fieldMapping.regex) {
    const match = value.match(new RegExp(fieldMapping.regex, 'i'));
    value = match?.[1] ?? match?.[0] ?? '';
  }
  if (fieldMapping.valueMap) {
    const normalizedValue = normalizeWhitespace(value);
    const directMatch = fieldMapping.valueMap[value] ?? fieldMapping.valueMap[normalizedValue];
    const caseInsensitiveMatch = Object.entries(fieldMapping.valueMap).find(([key]) => (
      normalizeWhitespace(key).toLowerCase() === normalizedValue.toLowerCase()
    ));
    value = directMatch ?? caseInsensitiveMatch?.[1] ?? fieldMapping.fallbackValue ?? '';
  }
  value = normalizeWhitespace(value);
  if (!value) return null;
  if (fieldMapping.transform === 'absoluteUrl') return canonicalActionDestinationUrl(value, baseUrl);
  return value;
};

const linkLabel = (element: Element | null): string => {
  if (!element) return '';
  return normalizeWhitespace([
    element.textContent ?? '',
    element.getAttribute('aria-label') ?? '',
    element.getAttribute('title') ?? '',
  ].join(' '));
};

const metadataContent = (document: Document, selector: string): string[] => Array.from(
  document.querySelectorAll(selector),
).map((element) => element.getAttribute('content') ?? '')
  .map(normalizedLower)
  .filter(Boolean);

const jsonLdRootNodes = (document: Document): JsonRecord[] => {
  const nodes: JsonRecord[] = [];
  const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]')).slice(0, 32);
  scripts.forEach((script) => {
    try {
      const parsed: unknown = JSON.parse(script.textContent ?? '');
      const values = Array.isArray(parsed) ? parsed : [parsed];
      values.forEach((value) => {
        const record = asRecord(value);
        if (!record) return;
        const graph = Array.isArray(record['@graph']) ? record['@graph'] : null;
        if (graph) {
          graph.slice(0, 32).forEach((entry) => {
            const graphRecord = asRecord(entry);
            if (graphRecord) nodes.push(graphRecord);
          });
          return;
        }
        nodes.push(record);
      });
    } catch {
      // Invalid JSON-LD is unknown evidence, not a reason to infer a document kind.
    }
  });
  return nodes.slice(0, 64);
};

const jsonLdTypes = (record: JsonRecord): string[] => {
  const rawType = record['@type'];
  const values = Array.isArray(rawType) ? rawType : [rawType];
  return values
    .map(stringValue)
    .filter((value): value is string => Boolean(value))
    .map((value) => normalizedLower(value).split(/[\/#]/).pop() ?? '');
};

const jsonLdUrlValues = (record: JsonRecord): string[] => {
  const values: string[] = [];
  ['url', 'mainEntityOfPage', '@id'].forEach((key) => {
    const value = record[key];
    const direct = stringValue(value);
    if (direct) values.push(direct);
    const nested = asRecord(value);
    const nestedUrl = nested ? stringValue(nested.url) ?? stringValue(nested['@id']) : null;
    if (nestedUrl) values.push(nestedUrl);
  });
  return values;
};


const hasPrimaryArticleJsonLd = (
  records: JsonRecord[],
  pageIdentityUrls: Set<string>,
  baseUrl: string,
  document: Document,
): boolean => {
  const heading = normalizedLower(document.querySelector('main h1, [role="main"] h1, h1')?.textContent ?? '');
  return records.some((record) => {
    if (!jsonLdTypes(record).some((type) => ARTICLE_TYPE_PATTERN.test(type))) return false;
    const urls = jsonLdUrlValues(record);
    if (urls.length === 0) {
      return Boolean(heading && normalizedLower(stringValue(record.headline) ?? '') === heading);
    }
    return urls.some((value) => {
      const normalized = canonicalDocumentIdentityUrl(value, baseUrl);
      return Boolean(normalized && pageIdentityUrls.has(normalized));
    });
  });
};

const documentKindFor = (
  document: Document,
  page: ScrapedPage,
  mapping: AffiliateScrapeMapping,
  includeOrganizationIdentity: boolean,
): {
  kind: AffiliateEntityActionSourceDocumentKind;
  contradictory: boolean;
  primaryOrganizationNames: ReadonlySet<string> | null;
} => {
  const baseUrl = page.finalUrl || page.url;
  const canonical = Array.from(document.querySelectorAll('link[rel]'))
    .map((element) => ({ rel: element.getAttribute('rel') ?? '', href: element.getAttribute('href') ?? '' }))
    .find((entry) => entry.rel.split(/\s+/).some((token) => token.toLowerCase() === 'canonical'))?.href;
  const pageIdentityUrls = new Set(
    [page.url, baseUrl, mapping.listUrl, canonical]
      .map((value) => value ? canonicalDocumentIdentityUrl(value, baseUrl) : null)
      .filter((value): value is string => Boolean(value)),
  );
  const ogTypes = metadataContent(document, 'meta[property="og:type"], meta[name="og:type"]');
  const jsonRecords = jsonLdRootNodes(document);
  const jsonArticle = hasPrimaryArticleJsonLd(jsonRecords, pageIdentityUrls, baseUrl, document);
  const explicitOgArticle = ogTypes.some((type) => /^(?:article|news(?:article)?|blogposting)$/i.test(type));
  const explicitOgOther = ogTypes.some((type) => /^(?:website|profile|webpage|profilepage)$/i.test(type));
  const jsonOther = !explicitOgArticle && !jsonArticle
    && jsonRecords.some((record) => jsonLdTypes(record).some((type) => OTHER_DOCUMENT_TYPE_PATTERN.test(type)));
  const article = explicitOgArticle || jsonArticle;
  const other = explicitOgOther || jsonOther;
  let primaryOrganizationNames: Set<string> | null = null;
  if (article && includeOrganizationIdentity) {
    for (const record of jsonRecords) {
      const name = stringValue(record.name);
      if (!name || !jsonLdTypes(record).some((type) => ORGANIZATION_TYPE_PATTERN.test(type))) continue;
      if (jsonLdUrlValues(record).some((value) => {
        const url = canonicalDocumentIdentityUrl(value, baseUrl);
        return Boolean(url && pageIdentityUrls.has(url));
      })) {
        (primaryOrganizationNames ??= new Set()).add(normalizedLower(name));
      }
    }
  }
  return {
    kind: article ? 'ARTICLE' : other ? 'OTHER' : 'UNKNOWN',
    contradictory: explicitOgArticle && explicitOgOther,
    primaryOrganizationNames,
  };
};

const isNavigationContainer = (element: Element): boolean => {
  const tagName = element.tagName.toLowerCase();
  if (tagName === 'nav') return true;
  if (normalizedLower(element.getAttribute('role') ?? '') === 'navigation') return true;
  if (tagName === 'html' || tagName === 'body' || tagName === 'main') return false;
  for (const token of element.classList) {
    if (NAVIGATION_CONTAINER_TOKEN_PATTERN.test(token)) return true;
  }
  return NAVIGATION_CONTAINER_TOKEN_PATTERN.test(element.getAttribute('id') ?? '');
};

const isWithinNavigation = (element: Element | null): boolean => {
  let current = element;
  while (current) {
    if (isNavigationContainer(current)) return true;
    current = current.parentElement;
  }
  return false;
};

const isWithinSelector = (element: Element | null, selector: string): boolean => (
  Boolean(element?.closest(selector))
);

const isActionAnchor = (element: Element | null): Element | null => {
  if (!element) return null;
  if (element.matches('a')) return element;
  return element.closest('a');
};

const manualActionKeyFor = (title: string, actionUrl: string | null): string | null => (
  actionUrl ? `${normalizedLower(title)}\u0000${actionUrl}` : null
);

const manualActionValueIndexFor = (
  mapping: AffiliateScrapeMapping,
  baseUrl: string,
): Map<string, string> => {
  const index = new Map<string, string>();
  mapping.manualCandidates?.forEach((candidate) => {
    const actionUrl = canonicalActionDestinationUrl(candidate.officialActionUrl, baseUrl);
    const key = manualActionKeyFor(candidate.title, actionUrl);
    if (key && !index.has(key)) index.set(key, candidate.officialActionUrl);
  });
  return index;
};

const actionEvidenceFor = (
  item: Element | null,
  candidate: AffiliateCandidateInput,
  mapping: AffiliateScrapeMapping,
  baseUrl: string,
  document: Document,
  manualActionValues: ReadonlyMap<string, string>,
): ActionEvidence => {
  const fieldMapping = mapping.fields.officialActionUrl;
  if (!fieldMapping) return { element: null, rawValue: null };
  if (fieldMapping.mode === 'literal') {
    const candidateActionUrl = canonicalActionDestinationUrl(candidate.officialActionUrl, baseUrl);
    const manualActionKey = manualActionKeyFor(candidate.title, candidateActionUrl);
    const rawValue = mappedActionValue(
      (manualActionKey ? manualActionValues.get(manualActionKey) ?? fieldMapping.value : fieldMapping.value) ?? null,
      fieldMapping,
      baseUrl,
    );
    const declaredUrl = rawValue ? canonicalActionDestinationUrl(rawValue, baseUrl) : null;
    if (!declaredUrl) return { element: null, rawValue: null };
    const matchingAnchor = Array.from((item ?? document).querySelectorAll('a[href]')).find((anchor) => (
      canonicalActionDestinationUrl(anchor.getAttribute('href') ?? '', baseUrl) === declaredUrl
    ));
    if (matchingAnchor) return { element: matchingAnchor, rawValue };
    const declaredActionUrl = new URL(declaredUrl);
    const canonicalPage = !declaredActionUrl.hash && (
      declaredUrl === canonicalDocumentIdentityUrl(baseUrl)
      || Array.from(document.querySelectorAll('link[rel]')).some((element) => (
        (element.getAttribute('rel') ?? '').split(/\s+/).some((token) => token.toLowerCase() === 'canonical')
          && canonicalDocumentIdentityUrl(element.getAttribute('href') ?? '', baseUrl)
            === canonicalDocumentIdentityUrl(declaredUrl, baseUrl)
      ))
    );
    return { element: item, rawValue: canonicalPage ? rawValue : null };
  }
  if (!item) return { element: null, rawValue: null };
  const element = selectAffiliateMappingElement(item, fieldMapping.selector);
  return {
    element,
    rawValue: mappedActionValue(valueFromMappingElement(element, fieldMapping), fieldMapping, baseUrl),
  };
};

const OFFICIAL_SITE_CONTEXT_PATTERN = /\bofficial\s+(?:site|website|page)\b/i;
const CONTEXT_BLOCK_ELEMENT_PATTERN = /^(?:address|article|aside|blockquote|div|dl|dt|dd|fieldset|figcaption|figure|footer|form|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|tbody|thead|tfoot|tr|ul)$/i;

type CandidateSourceUrlIndex = ReadonlySet<string>;

type CandidateTitleTrieNode = {
  children: Map<string, CandidateTitleTrieNode>;
  titleKey: string | null;
  count: number;
  firstIndex: number;
};

type CandidateTitleIndex = {
  root: CandidateTitleTrieNode;
  titleKeys: readonly string[];
};

const normalizedTitleTokens = (value: string): string[] => normalizedLower(value)
  .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
  .trim()
  .split(/\s+/)
  .filter(Boolean);

const titleKeyFor = (value: string): string => normalizedTitleTokens(value).join(' ');

const tokenSequenceAt = (
  valueTokens: readonly string[],
  sequenceTokens: readonly string[],
  startIndex: number,
): boolean => (
  sequenceTokens.length > 0
    && startIndex >= 0
    && startIndex + sequenceTokens.length <= valueTokens.length
    && sequenceTokens.every((token, offset) => valueTokens[startIndex + offset] === token)
);

const hasBoundOfficialSitePhrase = (value: string, ownTitle: string): boolean => {
  const valueTokens = normalizedTitleTokens(value);
  const ownTitleTokens = normalizedTitleTokens(ownTitle);
  const officialStarts: number[] = [];
  for (let index = 0; index < valueTokens.length - 1; index += 1) {
    if (
      valueTokens[index] === 'official'
      && ['site', 'website', 'page'].includes(valueTokens[index + 1] ?? '')
    ) {
      officialStarts.push(index);
    }
  }
  if (officialStarts.length !== 1) return false;
  const officialStart = officialStarts[0]!;
  const nameBeforePhrase = officialStart === ownTitleTokens.length
    && valueTokens.length === ownTitleTokens.length + 2
    && tokenSequenceAt(valueTokens, ownTitleTokens, 0)
    && valueTokens[officialStart] === 'official';
  const phraseForOwnTitle = officialStart === 0
    && valueTokens.length === ownTitleTokens.length + 3
    && ['for', 'of'].includes(valueTokens[2] ?? '')
    && tokenSequenceAt(valueTokens, ownTitleTokens, 3);
  return nameBeforePhrase || phraseForOwnTitle;
};

type OfficialSiteContextResult = {
  hasOwnOfficialContext: boolean;
  exceededLimit: boolean;
};

type ContextWalkState = {
  inspectedNodes: number;
  textLength: number;
  exceededLimit: boolean;
};

type ContextNodeScanResult = {
  barrier: boolean;
  boundary: boolean;
  text: string;
};

const appendContextText = (
  state: ContextWalkState,
  chunks: string[],
  value: string,
): void => {
  if (state.exceededLimit || !value) return;
  const remaining = MAX_CONTEXT_TEXT_LENGTH - state.textLength;
  if (value.length > remaining) {
    state.exceededLimit = true;
    return;
  }
  const normalized = normalizeWhitespace(value);
  if (!normalized) return;
  if (normalized.length > remaining) {
    state.exceededLimit = true;
    return;
  }
  state.textLength += normalized.length;
  chunks.push(normalized);
};

const scanContextNode = (
  node: Node,
  ownerItem: Element,
  selectedItems: ReadonlySet<Element>,
  state: ContextWalkState,
): ContextNodeScanResult => {
  const chunks: string[] = [];
  const pending: Node[] = [node];
  while (pending.length > 0 && !state.exceededLimit) {
    const current = pending.pop();
    if (!current) break;
    if (state.inspectedNodes >= MAX_CONTEXT_DOM_NODES) {
      state.exceededLimit = true;
      break;
    }
    state.inspectedNodes += 1;
    if (current.nodeType === 1) {
      const element = current as Element;
      if (
        (element !== ownerItem && selectedItems.has(element))
        || element.matches('a')
      ) {
        return { barrier: true, boundary: true, text: '' };
      }
      appendContextText(state, chunks, element.getAttribute('aria-label') ?? '');
      appendContextText(state, chunks, element.getAttribute('title') ?? '');
    } else if (current.nodeType === 3) {
      appendContextText(state, chunks, current.textContent ?? '');
    }
    const remainingNodes = MAX_CONTEXT_DOM_NODES - state.inspectedNodes;
    if (current.childNodes.length > remainingNodes) {
      state.exceededLimit = true;
      break;
    }
    for (let index = current.childNodes.length - 1; index >= 0; index -= 1) {
      const child = current.childNodes[index];
      if (child) pending.push(child);
    }
  }
  const rootElement = node.nodeType === 1 ? node as Element : null;
  return {
    barrier: false,
    boundary: Boolean(rootElement && CONTEXT_BLOCK_ELEMENT_PATTERN.test(rootElement.tagName)),
    text: chunks.join(' '),
  };
};

const adjacentContextTextFor = (
  child: Element,
  ownerItem: Element,
  selectedItems: ReadonlySet<Element>,
  state: ContextWalkState,
): string[] => {
  const before: string[] = [];
  const beforeInline: string[] = [];
  let sibling = child.previousSibling;
  while (sibling && !state.exceededLimit) {
    const result = scanContextNode(sibling, ownerItem, selectedItems, state);
    if (result.barrier) break;
    if (result.boundary) {
      if (beforeInline.length > 0) before.push(beforeInline.join(' '));
      beforeInline.length = 0;
      if (result.text) before.push(result.text);
    } else if (result.text) {
      beforeInline.unshift(result.text);
    }
    sibling = sibling.previousSibling;
  }
  if (beforeInline.length > 0) before.push(beforeInline.join(' '));

  const after: string[] = [];
  const afterInline: string[] = [];
  sibling = child.nextSibling;
  while (sibling && !state.exceededLimit) {
    const result = scanContextNode(sibling, ownerItem, selectedItems, state);
    if (result.barrier) break;
    if (result.boundary) {
      if (afterInline.length > 0) after.push(afterInline.join(' '));
      afterInline.length = 0;
      if (result.text) after.push(result.text);
    } else if (result.text) {
      afterInline.push(result.text);
    }
    sibling = sibling.nextSibling;
  }
  if (afterInline.length > 0) after.push(afterInline.join(' '));

  return [...before, ...after];
};

const hasOwnOfficialSiteContext = (
  item: Element | null,
  actionElement: Element | null,
  candidate: AffiliateCandidateInput,
  selectedItems: ReadonlySet<Element>,
): OfficialSiteContextResult => {
  if (!item || !actionElement || actionElement === item || !item.contains(actionElement)) {
    return { hasOwnOfficialContext: false, exceededLimit: false };
  }
  const ownTitle = titleKeyFor(candidate.title);
  if (!ownTitle) return { hasOwnOfficialContext: false, exceededLimit: false };

  const state: ContextWalkState = {
    inspectedNodes: 0,
    textLength: 0,
    exceededLimit: false,
  };
  let current = actionElement;
  let parent = actionElement.parentElement;
  while (parent && item.contains(parent)) {
    if (state.inspectedNodes >= MAX_CONTEXT_DOM_NODES) {
      return { hasOwnOfficialContext: false, exceededLimit: true };
    }
    state.inspectedNodes += 1;
    const contextSegments = adjacentContextTextFor(current, item, selectedItems, state);
    if (state.exceededLimit) {
      return { hasOwnOfficialContext: false, exceededLimit: true };
    }
    for (const rawContextText of contextSegments) {
      if (rawContextText.length > MAX_CONTEXT_TEXT_LENGTH) {
        return { hasOwnOfficialContext: false, exceededLimit: true };
      }
      const contextText = normalizeWhitespace(rawContextText);
      if (!OFFICIAL_SITE_CONTEXT_PATTERN.test(contextText)) continue;
      if (!hasBoundOfficialSitePhrase(contextText, ownTitle)) {
        return { hasOwnOfficialContext: false, exceededLimit: false };
      }
      return { hasOwnOfficialContext: true, exceededLimit: false };
    }
    if (parent === item) break;
    current = parent;
    parent = parent.parentElement;
  }
  return { hasOwnOfficialContext: false, exceededLimit: false };
};

const addUrlIndexEntry = (
  index: Set<string>,
  value: string | null,
): void => {
  if (value) index.add(value);
};

const candidateSourceUrlIndexFor = (
  sourceUrls: readonly (string | null)[],
): Set<string> => {
  const index = new Set<string>();
  sourceUrls.forEach((sourceUrl) => addUrlIndexEntry(index, sourceUrl));
  return index;
};

const candidateTitleIndexFor = (
  candidates: readonly AffiliateCandidateInput[],
): CandidateTitleIndex => {
  const root: CandidateTitleTrieNode = {
    children: new Map(),
    titleKey: null,
    count: 0,
    firstIndex: -1,
  };
  const titleKeys = candidates.map((candidate) => titleKeyFor(candidate.title));
  titleKeys.forEach((titleKey, candidateIndex) => {
    const tokens = titleKey.split(' ').filter(Boolean);
    if ((titleKey.length <= 2 && /^[\x00-\x7F]+$/.test(titleKey)) || tokens.length === 0) return;
    let node = root;
    tokens.forEach((token) => {
      let next = node.children.get(token);
      if (!next) {
        next = {
          children: new Map(),
          titleKey: null,
          count: 0,
          firstIndex: -1,
        };
        node.children.set(token, next);
      }
      node = next;
    });
    node.titleKey = titleKey;
    node.count += 1;
    if (node.firstIndex < 0) node.firstIndex = candidateIndex;
  });
  return { root, titleKeys };
};

const actionLabelMatchesOtherCandidate = (
  label: string,
  candidateIndex: number,
  titleIndex: CandidateTitleIndex,
): boolean => {
  const labelTokens = normalizedTitleTokens(label);
  const ownTitle = titleIndex.titleKeys[candidateIndex];
  let longestMatchLength = 0;
  let ownTitleMatches = false;
  let otherTitleMatches = false;
  labelTokens.forEach((_token, startIndex) => {
    let node = titleIndex.root;
    for (let endIndex = startIndex; endIndex < labelTokens.length; endIndex += 1) {
      const next = node.children.get(labelTokens[endIndex]);
      if (!next) break;
      node = next;
      if (node.count === 0) continue;
      const matchLength = endIndex - startIndex + 1;
      const nodeOwnTitle = node.titleKey === ownTitle;
      const nodeHasOtherTitle = node.count > 1 || node.firstIndex !== candidateIndex;
      if (matchLength > longestMatchLength) {
        longestMatchLength = matchLength;
        ownTitleMatches = nodeOwnTitle;
        otherTitleMatches = nodeHasOtherTitle;
      } else if (matchLength === longestMatchLength) {
        ownTitleMatches ||= nodeOwnTitle;
        otherTitleMatches ||= nodeHasOtherTitle;
      }
    }
  });
  return longestMatchLength > 0 && otherTitleMatches && !ownTitleMatches;
};

const canonicalActionPurpose = (
  actionUrl: URL,
  baseUrl: string,
  canonicalUrls: Set<string>,
  label: string,
  hasOwnOfficialContext: boolean,
  isInPageNavigation: boolean,
  allowCanonicalSelf: boolean,
): boolean => {
  if (isInPageNavigation) return false;
  if (EDITORIAL_ACTION_PATH_PATTERN.test(actionUrl.pathname)) return false;
  const comparableIdentity = canonicalDocumentIdentityUrl(actionUrl.toString(), baseUrl);
  if (!actionUrl.hash && comparableIdentity && canonicalUrls.has(comparableIdentity)) {
    return allowCanonicalSelf || hasOwnOfficialContext;
  }
  let baseOrigin: string;
  try {
    baseOrigin = new URL(baseUrl).origin.toLowerCase();
  } catch {
    baseOrigin = '';
  }
  const sameOrigin = actionUrl.origin.toLowerCase() === baseOrigin;
  const actionTarget = `${actionUrl.pathname}${actionUrl.search}${actionUrl.hash}`;
  const hasPublicAction = AFFILIATE_PUBLIC_ACTION_PATTERN.test(actionTarget)
    || AFFILIATE_PUBLIC_ACTION_PATTERN.test(label);
  const hasPathAction = ACTION_PATH_PATTERN.test(actionTarget)
    || ACTION_PATH_PATTERN.test(label)
    || MEMBERSHIP_ACTION_PATTERN.test(actionTarget)
    || MEMBERSHIP_ACTION_PATTERN.test(label);
  if (hasPublicAction || hasPathAction) return true;
  const explicitOfficialInformation = /\bofficial\s+(?:site|website|page)\b/i.test(label)
    || hasOwnOfficialContext;
  const explicitHomepage = actionUrl.pathname === '/'
    && (/\b(?:home|homepage|website)\b/i.test(label) || hasOwnOfficialContext);
  return (sameOrigin || explicitOfficialInformation || explicitHomepage) && (
    OFFICIAL_INFORMATION_PATH_PATTERN.test(actionUrl.pathname)
    || OFFICIAL_INFORMATION_LABEL_PATTERN.test(label)
    || hasOwnOfficialContext
  );
};

const candidateItemIndexFor = (
  candidate: AffiliateCandidateInput,
  candidateIndex: number,
  itemCount: number,
): number => {
  const rawPayload = candidate.rawPayload;
  const sourceIndex = rawPayload && typeof rawPayload.sourceIndex === 'number'
    && Number.isInteger(rawPayload.sourceIndex)
    ? rawPayload.sourceIndex
    : candidateIndex;
  return sourceIndex >= 0 && sourceIndex < itemCount ? sourceIndex : -1;
};

const addIssue = (
  issues: AffiliateEntityActionQualityIssue[],
  code: string,
  candidateIndex: number | null,
  message: string,
): void => {
  if (issues.length >= MAX_ISSUES) return;
  if (issues.some((issue) => issue.code === code && issue.candidateIndex === candidateIndex)) return;
  issues.push({ code, candidateIndex, message: boundedMessage(message) });
};

const actionMatchesOtherCandidate = (
  actionUrl: string,
  label: string,
  candidateIndex: number,
  ownSourceUrl: string | null,
  sourceUrlIndex: CandidateSourceUrlIndex,
  titleIndex: CandidateTitleIndex,
): boolean => {
  if (sourceUrlIndex.has(actionUrl) && ownSourceUrl !== actionUrl) return true;
  return actionLabelMatchesOtherCandidate(label, candidateIndex, titleIndex);
};

const nearestSelectedItemIndexFor = (
  element: Element | null,
  itemIndexes: ReadonlyMap<Element, number>,
): number => {
  let current = element;
  while (current) {
    const itemIndex = itemIndexes.get(current);
    if (itemIndex != null) return itemIndex;
    current = current.parentElement;
  }
  return -1;
};

const isInPageNavigation = (
  actionAnchor: Element | null,
  actionUrl: URL,
  baseUrl: string,
): boolean => {
  if (!actionAnchor) return false;
  const rawHref = actionAnchor.getAttribute('href')?.trim() ?? '';
  if (!rawHref.includes('#') && !actionUrl.hash) return false;
  const pageIdentity = canonicalDocumentIdentityUrl(baseUrl);
  const actionIdentity = canonicalDocumentIdentityUrl(actionUrl.toString(), baseUrl);
  if (!pageIdentity || actionIdentity !== pageIdentity) return false;
  const fragment = actionUrl.hash.slice(1);
  return fragment.length === 0 || !/^[/!]/.test(fragment);
};

export const analyzeAffiliateEntityActionQuality = (input: {
  page: ScrapedPage;
  mapping: AffiliateScrapeMapping;
  candidates: readonly AffiliateCandidateInput[];
}): AffiliateEntityActionQualityReport => {
  if (input.candidates.length > MAX_CANDIDATES) {
    return inputTooLargeReport(
      'UNKNOWN',
      null,
      `Entity/action quality accepts at most ${MAX_CANDIDATES} candidates.`,
    );
  }
  const oversizedTitleIndex = input.candidates.findIndex((candidate) => (
    candidate.title.length > MAX_CANDIDATE_TITLE_LENGTH
  ));
  if (oversizedTitleIndex >= 0) {
    return inputTooLargeReport(
      'UNKNOWN',
      oversizedTitleIndex,
      `Candidate title must not exceed ${MAX_CANDIDATE_TITLE_LENGTH} UTF-16 code units.`,
    );
  }

  const baseUrl = input.page.finalUrl || input.page.url;
  const dom = createAffiliateMappingDom(input.page.body, baseUrl);
  const document = dom.window.document;
  const hasClubCandidate = input.candidates.some((candidate) => candidate.listingKind === 'CLUB');
  const documentKind = documentKindFor(document, input.page, input.mapping, hasClubCandidate);
  const itemElements = selectAffiliateMappingItems(document, input.mapping);
  const itemIndexes = new Map<Element, number>();
  itemElements.forEach((item, itemIndex) => itemIndexes.set(item, itemIndex));
  const selectedItems = new Set(itemElements);
  const candidateActionUrls = input.candidates.map((candidate) => (
    canonicalActionDestinationUrl(candidate.officialActionUrl)
  ));
  const candidateSourceUrls = input.candidates.map((candidate) => (
    canonicalActionDestinationUrl(candidate.sourceUrl, baseUrl)
  ));
  const sourceUrlIndex = candidateSourceUrlIndexFor(candidateSourceUrls);
  const manualActionValues = manualActionValueIndexFor(input.mapping, baseUrl);
  const actionEvidences = input.candidates.map((candidate, candidateIndex) => {
    const candidateUrl = candidateActionUrls[candidateIndex];
    if (!candidateUrl) return { element: null, rawValue: null };
    const itemIndex = candidateItemIndexFor(candidate, candidateIndex, itemElements.length);
    const item = itemIndex >= 0 ? itemElements[itemIndex] ?? null : null;
    return actionEvidenceFor(
      item,
      candidate,
      input.mapping,
      baseUrl,
      document,
      manualActionValues,
    );
  });
  const actionLabels: string[] = [];
  for (let candidateIndex = 0; candidateIndex < actionEvidences.length; candidateIndex += 1) {
    const evidence = actionEvidences[candidateIndex]!;
    const actionElement = isActionAnchor(evidence.element) ?? evidence.element;
    const itemIndex = candidateItemIndexFor(
      input.candidates[candidateIndex]!,
      candidateIndex,
      itemElements.length,
    );
    const item = itemIndex >= 0 ? itemElements[itemIndex] ?? null : null;
    const label = (
      input.mapping.fields.officialActionUrl?.mode === 'literal'
      && actionElement === item
      && !isActionAnchor(evidence.element)
    ) ? '' : linkLabel(actionElement);
    if (label.length > MAX_ACTION_LABEL_LENGTH) {
      return inputTooLargeReport(
        documentKind.kind,
        candidateIndex,
        `Action label must not exceed ${MAX_ACTION_LABEL_LENGTH} UTF-16 code units.`,
      );
    }
    actionLabels.push(label);
  }
  const titleIndex = candidateTitleIndexFor(input.candidates);
  const canonicalUrls = new Set(
    [input.page.url, baseUrl, input.mapping.listUrl]
      .concat(Array.from(document.querySelectorAll('link[rel]'))
        .filter((element) => (element.getAttribute('rel') ?? '').split(/\s+/).some((token) => token.toLowerCase() === 'canonical'))
        .map((element) => element.getAttribute('href') ?? ''))
      .map((value) => canonicalDocumentIdentityUrl(value, baseUrl))
      .filter((value): value is string => Boolean(value)),
  );
  const issues: AffiliateEntityActionQualityIssue[] = [];

  if (documentKind.contradictory) {
    addIssue(
      issues,
      'DOCUMENT_KIND_CONTRADICTORY',
      null,
      'Stored document metadata identifies both an article and a non-article document kind.',
    );
  }
  if (input.candidates.length === 0) {
    addIssue(issues, 'NO_CANDIDATES', null, 'Entity/action quality cannot pass without an extracted candidate.');
  }

  input.candidates.forEach((candidate, candidateIndex) => {
    const itemIndex = candidateItemIndexFor(candidate, candidateIndex, itemElements.length);
    const item = itemIndex >= 0 ? itemElements[itemIndex] ?? null : null;
    const candidateUrl = candidateActionUrls[candidateIndex] ?? null;
    if (!candidateUrl) {
      addIssue(
        issues,
        'ACTION_URL_INVALID',
        candidateIndex,
        'The candidate official action URL is not an absolute HTTP(S) URL.',
      );
      return;
    }
    if (!item && !input.mapping.manualCandidates?.length) {
      addIssue(
        issues,
        'CANDIDATE_SCOPE_UNRESOLVED',
        candidateIndex,
        'The candidate has no corresponding item selected by the stored mapping.',
      );
    }

    const evidence = actionEvidences[candidateIndex] ?? { element: null, rawValue: null };
    const evidenceUrl = evidence.rawValue ? canonicalActionDestinationUrl(evidence.rawValue, baseUrl) : null;
    if (!evidenceUrl) {
      addIssue(
        issues,
        'ACTION_NOT_EVIDENCED',
        candidateIndex,
        'The candidate official action URL is not backed by a selected source element or explicit manual action evidence.',
      );
      return;
    }
    const actionElement = isActionAnchor(evidence.element) ?? evidence.element;
    const actionAnchor = isActionAnchor(evidence.element);
    const observedActionUrl = actionAnchor
      ? canonicalActionDestinationUrl(actionAnchor.getAttribute('href') ?? '', baseUrl)
      : null;
    const navigation = Boolean(
      observedActionUrl
        && isInPageNavigation(actionAnchor, new URL(observedActionUrl), baseUrl),
    );
    if (navigation) {
      addIssue(
        issues,
        'ACTION_NAVIGATION',
        candidateIndex,
        'The selected action is an in-page navigation rather than an action destination.',
      );
    }
    if (evidenceUrl !== candidateUrl) {
      addIssue(
        issues,
        'ACTION_URL_MISMATCH',
        candidateIndex,
        'The selected source action URL does not match the candidate official action URL.',
      );
      return;
    }

    if (input.mapping.fields.officialActionUrl.mode !== 'literal' && !actionAnchor) {
      addIssue(issues, 'ACTION_NOT_EVIDENCED', candidateIndex, 'The mapped action is not a source link.');
      return;
    }
    if (actionAnchor && observedActionUrl !== candidateUrl) {
      addIssue(issues, 'ACTION_URL_MISMATCH', candidateIndex, 'The source link destination differs from the mapped action URL.');
      return;
    }
    const label = actionLabels[candidateIndex] ?? '';
    const actionUrl = new URL(evidenceUrl);
    const ownerIndex = nearestSelectedItemIndexFor(actionElement, itemIndexes);
    const ownerItem = ownerIndex >= 0 ? itemElements[ownerIndex] ?? null : item;
    if (isWithinNavigation(actionElement ?? evidence.element)) {
      addIssue(
        issues,
        'ACTION_NAVIGATION',
        candidateIndex,
        'The selected action is inside source navigation rather than the candidate content scope.',
      );
    }
    if (isWithinSelector(actionElement ?? evidence.element, RELATED_SCOPE_SELECTOR)) {
      addIssue(
        issues,
        'ACTION_RELATED_STORY',
        candidateIndex,
        'The selected action is inside a related-story or recommendation block.',
      );
    }
    if (ownerIndex !== itemIndex) {
      addIssue(
        issues,
        'ACTION_CROSS_CANDIDATE',
        candidateIndex,
        'The selected action belongs to another extracted candidate scope.',
      );
    }
    if (actionMatchesOtherCandidate(
      evidenceUrl,
      label,
      candidateIndex,
      candidateSourceUrls[candidateIndex] ?? null,
      sourceUrlIndex,
      titleIndex,
    )) {
      addIssue(
        issues,
        'ACTION_CROSS_CANDIDATE',
        candidateIndex,
        'The selected action URL points at another candidate source rather than this candidate.',
      );
    }
    const articleClub = documentKind.kind === 'ARTICLE' && candidate.listingKind === 'CLUB';
    const allowCanonicalSelf = !articleClub
      || Boolean(documentKind.primaryOrganizationNames?.has(normalizedLower(candidate.title)));
    const directPurpose = canonicalActionPurpose(
      actionUrl,
      baseUrl,
      canonicalUrls,
      label,
      false,
      navigation,
      allowCanonicalSelf,
    );
    let supportedPurpose = directPurpose;
    if (
      !directPurpose
      && !navigation
      && !EDITORIAL_ACTION_PATH_PATTERN.test(actionUrl.pathname)
      && actionElement
      && ownerItem
      && actionElement !== ownerItem
    ) {
      const context = hasOwnOfficialSiteContext(ownerItem, actionElement, candidate, selectedItems);
      if (context.exceededLimit) {
        addIssue(
          issues,
          'INPUT_TOO_LARGE',
          candidateIndex,
          'Contextual action evidence exceeds the bounded DOM or text limit.',
        );
        return;
      }
      supportedPurpose = canonicalActionPurpose(
        actionUrl,
        baseUrl,
        canonicalUrls,
        label,
        context.hasOwnOfficialContext,
        navigation,
        allowCanonicalSelf,
      );
    }
    if (!supportedPurpose) {
      if (articleClub) {
        addIssue(
          issues,
          'DOCUMENT_ENTITY_MISMATCH',
          candidateIndex,
          'Article context alone does not establish a CLUB action. Select an entity-scoped action or named organization evidence.',
        );
      }
      addIssue(
        issues,
        'ACTION_PURPOSE_UNSUPPORTED',
        candidateIndex,
        'The selected action has no evidenced registration, membership, booking, or canonical official-information purpose.',
      );
    }
  });

  return {
    schemaVersion: 1,
    isValid: issues.length === 0,
    sourceDocumentKind: documentKind.kind,
    issues,
  };
};

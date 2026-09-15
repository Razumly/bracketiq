/** @jest-environment node */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { TextDecoder, TextEncoder } from 'node:util';
import type {
  AffiliateCandidateInput,
  AffiliateScrapeMapping,
  ScrapedPage,
} from '../types';
import { analyzeAffiliateEntityActionQuality } from '../entityActionQuality';
import { extractAffiliateCandidatesFromPage } from '../mappingExtractor';

Object.assign(global, { TextDecoder, TextEncoder });

const articleUrl = 'https://www.collegiateflagfootball.com/california-georgia-tech-lbsu-ucla-adding-flag-football-club-teams';
const articlePage: ScrapedPage = {
  url: articleUrl,
  finalUrl: articleUrl,
  statusCode: 200,
  fetchedAt: '2026-09-14T12:00:00.000Z',
  body: readFileSync(path.join(__dirname, '../fixtures/entityActionQualityArticle.html'), 'utf8'),
};
const articleMapping: AffiliateScrapeMapping = {
  kind: 'CLUB',
  listUrl: articleUrl,
  itemSelector: 'article.article',
  fields: {
    title: { selector: '.article-title', mode: 'text' },
    sportName: { selector: ':scope', mode: 'literal', value: 'Flag Football' },
    description: { selector: '.gh-content p:first-of-type', mode: 'text' },
    officialActionUrl: {
      selector: ".gh-content a[href*='rutgers-valparaiso-adding-flag-football-club-teams']",
      mode: 'attribute',
      attribute: 'href',
      transform: 'absoluteUrl',
    },
  },
};

const candidateFor = (
  title: string,
  officialActionUrl: string,
  sourceUrl: string,
  listingKind: AffiliateCandidateInput['listingKind'] = 'CLUB',
): AffiliateCandidateInput => ({
  listingKind,
  title,
  officialActionUrl,
  sourceUrl,
});

const clubMappingFor = (
  listUrl: string,
  actionSelector = '.action',
  kind: AffiliateScrapeMapping['kind'] = 'CLUB',
): AffiliateScrapeMapping => ({
  kind,
  listUrl,
  itemSelector: '.club-card',
  fields: {
    title: { selector: '.title', mode: 'text' },
    officialActionUrl: {
      selector: actionSelector,
      mode: 'attribute',
      attribute: 'href',
      transform: 'absoluteUrl',
    },
  },
});

const pageFor = (url: string, body: string): ScrapedPage => ({
  url,
  finalUrl: url,
  statusCode: 200,
  fetchedAt: '2026-09-14T12:00:00.000Z',
  body,
});

describe('analyzeAffiliateEntityActionQuality', () => {
  it('rejects the stored article pattern even with valid sport prose and URL syntax', () => {
    const report = analyzeAffiliateEntityActionQuality({
      page: articlePage,
      mapping: articleMapping,
      candidates: [candidateFor(
        'California, Georgia Tech, LBSU, and UCLA Add Flag Football Club Teams',
        'https://www.collegiateflagfootball.com/rutgers-valparaiso-adding-flag-football-club-teams/',
        articleUrl,
      )],
    });

    expect(report).toMatchObject({ schemaVersion: 1, isValid: false, sourceDocumentKind: 'ARTICLE' });
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'DOCUMENT_ENTITY_MISMATCH', candidateIndex: 0 }),
      expect.objectContaining({ code: 'ACTION_PURPOSE_UNSUPPORTED', candidateIndex: 0 }),
    ]));
  });

  it('does not reject a club homepage because an unrelated news widget is present', () => {
    const url = 'https://river-club.example/';
    const page = pageFor(url, `
      <html><head>
        <meta property="og:type" content="website">
        <script type="application/ld+json">{"@type":"Article","url":"${url}news/old-story","headline":"Old news"}</script>
      </head><body><main>
        <div class="club-card"><h2 class="title">River Club</h2><a class="action" href="/register">Register for River Club</a></div>
        <section class="news-widget"><article class="post-card"><a href="/news/old-story">Read more</a></article></section>
      </main></body></html>
    `);
    const mapping = clubMappingFor(url);
    const report = analyzeAffiliateEntityActionQuality({
      page,
      mapping,
      candidates: [candidateFor('River Club', `${url}register`, url)],
    });

    expect(report.sourceDocumentKind).toBe('OTHER');
    expect(report).toMatchObject({ schemaVersion: 1, isValid: true, issues: [] });
  });

  it('accepts a plain club homepage with a scoped registration action and no SEO metadata', () => {
    const url = 'https://river-club.example/';
    const page = pageFor(url, `
      <main><div class="club-card">
        <h2 class="title">River Club</h2>
        <a class="action" href="/register">Register</a>
      </div></main>
    `);
    const report = analyzeAffiliateEntityActionQuality({
      page,
      mapping: clubMappingFor(url),
      candidates: [candidateFor('River Club', `${url}register`, url)],
    });

    expect(report).toMatchObject({ schemaVersion: 1, isValid: true, sourceDocumentKind: 'UNKNOWN', issues: [] });
  });

  it.each([
    ['registration', '/registration/summer', 'Register for summer programs'],
    ['membership', '/membership', 'Join the club'],
    ['booking', 'https://booking.example.test/facility/book', 'Book a court'],
    ['query registration', 'https://portal.example/form?action=register', 'Continue'],
    ['query booking', 'https://booking.example.test/form?flow=booking', 'Continue'],
    ['hash registration', 'https://portal.example/#/register', 'Continue'],
  ])('accepts a direct %s action backed by its own item link', (_label, href, anchorLabel) => {
    const url = 'https://river-club.example/programs';
    const page = pageFor(url, `
      <main><div class="club-card">
        <h2 class="title">River Club</h2>
        <a class="action" href="${href}">${anchorLabel}</a>
      </div></main>
    `);
    const mapping = clubMappingFor(url, '.action', href.startsWith('https://booking') ? 'RENTAL' : 'CLUB');
    const actionUrl = href.startsWith('http') ? href : new URL(href, url).toString();
    const report = analyzeAffiliateEntityActionQuality({
      page,
      mapping,
      candidates: [candidateFor('River Club', actionUrl, url, mapping.kind)],
    });

    expect(report).toMatchObject({ schemaVersion: 1, isValid: true, issues: [] });
  });

  it('accepts a candidate source URL as a canonical official homepage action', () => {
    const pageUrl = 'https://directory.example/clubs';
    const officialUrl = 'https://river-club.example/';
    const page = pageFor(pageUrl, `
      <main><div class="club-card">
        <h2 class="title">River Club</h2>
        <a class="action" href="${officialUrl}">Home</a>
      </div></main>
    `);
    const report = analyzeAffiliateEntityActionQuality({
      page,
      mapping: clubMappingFor(pageUrl),
      candidates: [candidateFor('River Club', officialUrl, officialUrl)],
    });

    expect(report).toMatchObject({ schemaVersion: 1, isValid: true, issues: [] });
  });

  it('requires source evidence for a literal action and permits the captured canonical page', () => {
    const url = 'https://river-club.example/';
    const page = pageFor(url, '<main class="club-card"><h1 class="title">River Club</h1></main>');
    const mapping = clubMappingFor(url);
    mapping.fields.officialActionUrl = { selector: ':scope', mode: 'literal', value: `${url}register` };
    const unevidenced = analyzeAffiliateEntityActionQuality({
      page, mapping, candidates: [candidateFor('River Club', `${url}register`, `${url}register`)],
    });
    expect(unevidenced.isValid).toBe(false);
    expect(unevidenced.issues).toContainEqual(expect.objectContaining({ code: 'ACTION_NOT_EVIDENCED' }));
    mapping.fields.officialActionUrl.value = url;
    expect(analyzeAffiliateEntityActionQuality({
      page, mapping, candidates: [candidateFor('River Club', url, url)],
    }).isValid).toBe(true);
  });

  it('rejects a mapped attribute that changes the actual link destination', () => {
    const url = 'https://river-club.example/';
    const page = pageFor(url, '<main class="club-card"><a class="action" href="/news/story" data-action="/register">Register</a></main>');
    const mapping = clubMappingFor(url);
    mapping.fields.officialActionUrl.attribute = 'data-action';
    const report = analyzeAffiliateEntityActionQuality({
      page, mapping, candidates: [candidateFor('River Club', `${url}register`, url)],
    });
    expect(report.isValid).toBe(false);
    expect(report.issues).toContainEqual(expect.objectContaining({ code: 'ACTION_URL_MISMATCH' }));
  });

  it('preserves hash routes when checking the exact mapped action destination', () => {
    const url = 'https://river-club.example/';
    const page = pageFor(url, `
      <main><div class="club-card">
        <h2 class="title">River Club</h2>
        <a class="action" href="https://portal.example/#/login" data-action="https://portal.example/#/register">Register</a>
      </div></main>
    `);
    const mapping = clubMappingFor(url);
    mapping.fields.officialActionUrl.attribute = 'data-action';
    const report = analyzeAffiliateEntityActionQuality({
      page,
      mapping,
      candidates: [candidateFor('River Club', 'https://portal.example/#/register', url)],
    });

    expect(report.isValid).toBe(false);
    expect(report.issues).toContainEqual(expect.objectContaining({
      code: 'ACTION_URL_MISMATCH',
      candidateIndex: 0,
    }));
  });

  it('rejects a selected related-story action even when its URL is syntactically valid', () => {
    const url = 'https://river-club.example/';
    const page = pageFor(url, `
      <main><div class="club-card">
        <h2 class="title">River Club</h2>
        <div class="related-stories"><a class="action" href="/stories/summer">Related story</a></div>
      </div></main>
    `);
    const report = analyzeAffiliateEntityActionQuality({
      page,
      mapping: clubMappingFor(url),
      candidates: [candidateFor('River Club', `${url}stories/summer`, url)],
    });

    expect(report.isValid).toBe(false);
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'ACTION_RELATED_STORY', candidateIndex: 0 }),
      expect.objectContaining({ code: 'ACTION_PURPOSE_UNSUPPORTED', candidateIndex: 0 }),
    ]));
  });

  it('rejects a navigation link selected as the candidate action', () => {
    const url = 'https://river-club.example/';
    const page = pageFor(url, `
      <main><div class="club-card">
        <h2 class="title">River Club</h2>
        <nav><a class="action" href="/register">Register</a></nav>
      </div></main>
    `);
    const report = analyzeAffiliateEntityActionQuality({
      page,
      mapping: clubMappingFor(url),
      candidates: [candidateFor('River Club', `${url}register`, url)],
    });

    expect(report.isValid).toBe(false);
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'ACTION_NAVIGATION', candidateIndex: 0 }),
    ]));
  });

  it('rejects an in-page fragment navigation even when it is the candidate destination', () => {
    const url = 'https://river-club.example/';
    const page = pageFor(url, `
      <main><div class="club-card">
        <h2 class="title">River Club</h2>
        <a class="action" href="#news">News</a>
      </div></main>
    `);
    const report = analyzeAffiliateEntityActionQuality({
      page,
      mapping: clubMappingFor(url),
      candidates: [candidateFor('River Club', `${url}#news`, url)],
    });

    expect(report.isValid).toBe(false);
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'ACTION_NAVIGATION', candidateIndex: 0 }),
      expect.objectContaining({ code: 'ACTION_PURPOSE_UNSUPPORTED', candidateIndex: 0 }),
    ]));
  });

  it('accepts an explicitly evidenced own-candidate official website context', () => {
    const pageUrl = 'https://directory.example/clubs';
    const officialUrl = 'https://river-club.example/';
    const page = pageFor(pageUrl, `
      <main><div class="club-card">
        <h2 class="title">River Club</h2>
        <p>Official website for River Club: <a class="action" href="${officialUrl}">River Club</a></p>
      </div></main>
    `);
    const mapping = clubMappingFor(pageUrl);
    const candidates = extractAffiliateCandidatesFromPage(page, mapping);
    const report = analyzeAffiliateEntityActionQuality({ page, mapping, candidates });

    expect(report).toMatchObject({ schemaVersion: 1, isValid: true, issues: [] });
  });

  it('accepts an explicitly bound own-name-before-official-site context', () => {
    const pageUrl = 'https://directory.example/clubs';
    const officialUrl = 'https://river-club.example/';
    const page = pageFor(pageUrl, `
      <main><div class="club-card">
        <h2 class="title">River Club</h2>
        <p>River Club official website: <a class="action" href="${officialUrl}">Visit</a></p>
      </div></main>
    `);
    const mapping = clubMappingFor(pageUrl);
    const candidates = extractAffiliateCandidatesFromPage(page, mapping);
    const report = analyzeAffiliateEntityActionQuality({ page, mapping, candidates });

    expect(report).toMatchObject({ schemaVersion: 1, isValid: true, issues: [] });
  });

  it('accepts an own name and official-site phrase split across inline labels', () => {
    const pageUrl = 'https://directory.example/clubs';
    const officialUrl = 'https://river-club.example/';
    const page = pageFor(pageUrl, `
      <main><div class="club-card">
        <p><span>River Club</span><strong> official website:</strong>
          <a class="action" href="${officialUrl}">Visit</a>
        </p>
      </div></main>
    `);
    const mapping = clubMappingFor(pageUrl);
    const candidates = [candidateFor('River Club', officialUrl, pageUrl)];
    const report = analyzeAffiliateEntityActionQuality({ page, mapping, candidates });

    expect(report).toMatchObject({ schemaVersion: 1, isValid: true, issues: [] });
  });

  it('rejects competing official-site phrases in one inline label segment', () => {
    const pageUrl = 'https://directory.example/clubs';
    const unrelatedUrl = 'https://mountain.example/';
    const page = pageFor(pageUrl, `
      <main><div class="club-card">
        <p><span>River Club official website.</span>
          <span>Mountain Club official website:</span>
          <a class="action" href="${unrelatedUrl}">Visit</a>
        </p>
      </div></main>
    `);
    const report = analyzeAffiliateEntityActionQuality({
      page,
      mapping: clubMappingFor(pageUrl),
      candidates: [candidateFor('River Club', unrelatedUrl, pageUrl)],
    });

    expect(report.isValid).toBe(false);
    expect(report.issues).toContainEqual(expect.objectContaining({
      code: 'ACTION_PURPOSE_UNSUPPORTED',
      candidateIndex: 0,
    }));
  });

  it('does not borrow an official website context from another candidate', () => {
    const pageUrl = 'https://directory.example/clubs';
    const page = pageFor(pageUrl, `
      <main>
        <div class="club-card">
          <h2 class="title">River Club</h2>
          <a class="action" href="https://river-club.example/">River Club</a>
        </div>
        <div class="club-card">
          <h2 class="title">Mountain Club</h2>
          <p>Official website for Mountain Club</p>
          <a class="action" href="/register">Register</a>
        </div>
      </main>
    `);
    const mapping = clubMappingFor(pageUrl);
    const candidates = extractAffiliateCandidatesFromPage(page, mapping);
    const report = analyzeAffiliateEntityActionQuality({ page, mapping, candidates });

    expect(report.isValid).toBe(false);
    expect(report.issues).toContainEqual(expect.objectContaining({
      code: 'ACTION_PURPOSE_UNSUPPORTED',
      candidateIndex: 0,
    }));
    expect(report.issues).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ candidateIndex: 1 }),
    ]));
  });

  it('does not borrow official context across a sibling action link', () => {
    const pageUrl = 'https://directory.example/clubs';
    const unrelatedUrl = 'https://store.example/merchandise';
    const page = pageFor(pageUrl, `
      <main><div class="club-card">
        <h2 class="title">River Club</h2>
        <p>Official website for River Club:
          <a href="https://river-club.example/">River Club</a>
          <a class="action" href="${unrelatedUrl}">Merchandise</a>
        </p>
      </div></main>
    `);
    const report = analyzeAffiliateEntityActionQuality({
      page,
      mapping: clubMappingFor(pageUrl),
      candidates: [candidateFor('River Club', unrelatedUrl, pageUrl)],
    });

    expect(report.isValid).toBe(false);
    expect(report.issues).toContainEqual(expect.objectContaining({
      code: 'ACTION_PURPOSE_UNSUPPORTED',
      candidateIndex: 0,
    }));
  });

  it('does not let a nearer conflicting official context be overridden by the item heading', () => {
    const pageUrl = 'https://directory.example/clubs';
    const unrelatedUrl = 'https://mountain.example/';
    const page = pageFor(pageUrl, `
      <main><div class="club-card">
        <h2 class="title">River Club</h2>
        <p>Mountain Club official website:
          <a class="action" href="${unrelatedUrl}">Visit</a>
        </p>
      </div></main>
    `);
    const report = analyzeAffiliateEntityActionQuality({
      page,
      mapping: clubMappingFor(pageUrl),
      candidates: [candidateFor('River Club', unrelatedUrl, pageUrl)],
    });

    expect(report.isValid).toBe(false);
    expect(report.issues).toContainEqual(expect.objectContaining({
      code: 'ACTION_PURPOSE_UNSUPPORTED',
      candidateIndex: 0,
    }));
  });

  it('rejects a conflicting direct-child name-before-phrase label', () => {
    const pageUrl = 'https://directory.example/clubs';
    const unrelatedUrl = 'https://mountain.example/';
    const page = pageFor(pageUrl, `
      <main><div class="club-card">
        <h2 class="title">River Club</h2>
        Mountain Club official website:
        <a class="action" href="${unrelatedUrl}">Visit</a>
      </div></main>
    `);
    const report = analyzeAffiliateEntityActionQuality({
      page,
      mapping: clubMappingFor(pageUrl),
      candidates: [candidateFor('River Club', unrelatedUrl, pageUrl)],
    });

    expect(report.isValid).toBe(false);
    expect(report.issues).toContainEqual(expect.objectContaining({
      code: 'ACTION_PURPOSE_UNSUPPORTED',
      candidateIndex: 0,
    }));
  });

  it('rejects a conflicting sibling-wrapper label before a farther heading', () => {
    const pageUrl = 'https://directory.example/clubs';
    const unrelatedUrl = 'https://mountain.example/';
    const page = pageFor(pageUrl, `
      <main><div class="club-card">
        <h2 class="title">River Club</h2>
        <p>Mountain Club official website:</p>
        <div><a class="action" href="${unrelatedUrl}">Visit</a></div>
      </div></main>
    `);
    const report = analyzeAffiliateEntityActionQuality({
      page,
      mapping: clubMappingFor(pageUrl),
      candidates: [candidateFor('River Club', unrelatedUrl, pageUrl)],
    });

    expect(report.isValid).toBe(false);
    expect(report.issues).toContainEqual(expect.objectContaining({
      code: 'ACTION_PURPOSE_UNSUPPORTED',
      candidateIndex: 0,
    }));
  });

  it('does not let a parent title override conflicting visible context', () => {
    const pageUrl = 'https://directory.example/clubs';
    const unrelatedUrl = 'https://mountain.example/';
    const page = pageFor(pageUrl, `
      <main><div class="club-card">
        <p title="River Club official website">
          Mountain Club official website:
          <a class="action" href="${unrelatedUrl}">Visit</a>
        </p>
      </div></main>
    `);
    const report = analyzeAffiliateEntityActionQuality({
      page,
      mapping: clubMappingFor(pageUrl),
      candidates: [candidateFor('River Club', unrelatedUrl, pageUrl)],
    });

    expect(report.isValid).toBe(false);
    expect(report.issues).toContainEqual(expect.objectContaining({
      code: 'ACTION_PURPOSE_UNSUPPORTED',
      candidateIndex: 0,
    }));
  });

  it('rejects an editorial registration story selected as an action', () => {
    const url = 'https://river-club.example/';
    const page = pageFor(url, `
      <main><div class="club-card">
        <h2 class="title">River Club</h2>
        <section class="relatedStories" aria-label="Related stories">
          <a class="action" href="/stories/registration-opens-for-mountain">Registration opens for Mountain Club</a>
        </section>
      </div></main>
    `);
    const report = analyzeAffiliateEntityActionQuality({
      page,
      mapping: clubMappingFor(url),
      candidates: [candidateFor('River Club', `${url}stories/registration-opens-for-mountain`, url)],
    });

    expect(report.isValid).toBe(false);
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'ACTION_RELATED_STORY', candidateIndex: 0 }),
      expect.objectContaining({ code: 'ACTION_PURPOSE_UNSUPPORTED', candidateIndex: 0 }),
    ]));
  });

  it('rejects a shared action that points at another candidate source', () => {
    const pageUrl = 'https://directory.example/clubs';
    const page = pageFor(pageUrl, `
      <main>
        <div class="club-card">
          <h2 class="title">River Club</h2>
          <a class="source" href="/clubs/river">Source</a>
          <a class="action" href="/clubs/mountain">Official website</a>
        </div>
        <div class="club-card">
          <h2 class="title">Mountain Club</h2>
          <a class="source" href="/clubs/mountain">Source</a>
          <a class="action" href="/clubs/mountain">Official website</a>
        </div>
      </main>
    `);
    const mapping = clubMappingFor(pageUrl);
    mapping.fields.sourceUrl = {
      selector: '.source',
      mode: 'attribute',
      attribute: 'href',
      transform: 'absoluteUrl',
    };
    const candidates = extractAffiliateCandidatesFromPage(page, mapping);
    const report = analyzeAffiliateEntityActionQuality({ page, mapping, candidates });

    expect(report.isValid).toBe(false);
    expect(report.issues).toContainEqual(expect.objectContaining({
      code: 'ACTION_CROSS_CANDIDATE',
      candidateIndex: 0,
    }));
  });

  it('accepts own actions when candidate titles overlap', () => {
    const pageUrl = 'https://directory.example/clubs';
    const page = pageFor(pageUrl, `
      <main>
        <div class="club-card">
          <h2 class="title">River Club</h2>
          <a class="action" href="/register/river">River Club official website</a>
        </div>
        <div class="club-card">
          <h2 class="title">River Club Juniors</h2>
          <a class="action" href="/register/juniors">River Club Juniors official website</a>
        </div>
      </main>
    `);
    const mapping = clubMappingFor(pageUrl);
    const candidates = extractAffiliateCandidatesFromPage(page, mapping);
    const report = analyzeAffiliateEntityActionQuality({ page, mapping, candidates });

    expect(report).toMatchObject({ schemaVersion: 1, isValid: true, issues: [] });
  });

  it('rejects an action label that names another candidate', () => {
    const pageUrl = 'https://directory.example/clubs';
    const page = pageFor(pageUrl, `
      <main>
        <div class="club-card">
          <h2 class="title">River Club</h2>
          <a class="action" href="/register/shared">River Club official website</a>
        </div>
        <div class="club-card">
          <h2 class="title">Mountain Club</h2>
          <a class="action" href="/register/shared">River Club official website</a>
        </div>
      </main>
    `);
    const mapping = clubMappingFor(pageUrl);
    const candidates = extractAffiliateCandidatesFromPage(page, mapping);
    const report = analyzeAffiliateEntityActionQuality({ page, mapping, candidates });

    expect(report.isValid).toBe(false);
    expect(report.issues).toContainEqual(expect.objectContaining({
      code: 'ACTION_CROSS_CANDIDATE',
      candidateIndex: 1,
    }));
  });

  it('keeps non-ASCII candidate titles distinct in action labels', () => {
    const pageUrl = 'https://directory.example/clubs';
    const page = pageFor(pageUrl, `
      <main>
        <div class="club-card">
          <h2 class="title">北京俱乐部</h2>
          <a class="action" href="/register/beijing">北京俱乐部 official website</a>
        </div>
        <div class="club-card">
          <h2 class="title">上海俱乐部</h2>
          <a class="action" href="/register/shanghai">北京俱乐部 official website</a>
        </div>
      </main>
    `);
    const mapping = clubMappingFor(pageUrl);
    const candidates = extractAffiliateCandidatesFromPage(page, mapping);
    const report = analyzeAffiliateEntityActionQuality({ page, mapping, candidates });

    expect(report.isValid).toBe(false);
    expect(report.issues).toContainEqual(expect.objectContaining({
      code: 'ACTION_CROSS_CANDIDATE',
      candidateIndex: 1,
    }));
  });

  it('rejects a candidate title beyond the bounded UTF-16 size', () => {
    const url = 'https://river-club.example/';
    const report = analyzeAffiliateEntityActionQuality({
      page: pageFor(url, '<main></main>'),
      mapping: clubMappingFor(url),
      candidates: [candidateFor('R'.repeat(513), `${url}register`, url)],
    });

    expect(report.isValid).toBe(false);
    expect(report.issues).toContainEqual(expect.objectContaining({
      code: 'INPUT_TOO_LARGE',
      candidateIndex: 0,
    }));
  });

  it('rejects an action label beyond the bounded UTF-16 size', () => {
    const url = 'https://directory.example/clubs';
    const actionUrl = 'https://store.example/merchandise';
    const page = pageFor(url, `
      <main><div class="club-card">
        <h2 class="title">River Club</h2>
        <a class="action" href="${actionUrl}">${'M'.repeat(513)}</a>
      </div></main>
    `);
    const report = analyzeAffiliateEntityActionQuality({
      page,
      mapping: clubMappingFor(url),
      candidates: [candidateFor('River Club', actionUrl, url)],
    });

    expect(report.isValid).toBe(false);
    expect(report.issues).toContainEqual(expect.objectContaining({
      code: 'INPUT_TOO_LARGE',
      candidateIndex: 0,
    }));
  });

  it('rejects a candidate collection beyond the bounded count', () => {
    const url = 'https://directory.example/clubs';
    const candidates = Array.from({ length: 1_001 }, (_, index) => (
      candidateFor(`Club ${index}`, `${url}/register/${index}`, url)
    ));
    const report = analyzeAffiliateEntityActionQuality({
      page: pageFor(url, ''),
      mapping: clubMappingFor(url),
      candidates,
    });

    expect(report.isValid).toBe(false);
    expect(report.issues).toContainEqual(expect.objectContaining({
      code: 'INPUT_TOO_LARGE',
      candidateIndex: null,
    }));
  });

  it('does not recurse through deep nesting when direct action evidence is sufficient', () => {
    const url = 'https://river-club.example/';
    const nested = `${'<div>'.repeat(160)}<a class="action" href="/register">Register</a>${'</div>'.repeat(160)}`;
    const page = pageFor(url, `
      <main><div class="club-card">
        <h2 class="title">River Club</h2>
        ${nested}
      </div></main>
    `);
    const report = analyzeAffiliateEntityActionQuality({
      page,
      mapping: clubMappingFor(url),
      candidates: [candidateFor('River Club', `${url}register`, url)],
    });

    expect(report).toMatchObject({ schemaVersion: 1, isValid: true, issues: [] });
  });

  it('assigns nested actions to their nearest selected candidate item', () => {
    const url = 'https://river-club.example/';
    const page = pageFor(url, `
      <main><div class="club-card" id="outer">
        <h2 class="title">Outer Club</h2>
        <a class="action" href="/register/outer">Register Outer Club</a>
        <div class="club-card" id="inner">
          <h2 class="title">Inner Club</h2>
          <a class="action" href="/register/inner">Register Inner Club</a>
        </div>
      </div></main>
    `);
    const mapping = clubMappingFor(url);
    const candidates = extractAffiliateCandidatesFromPage(page, mapping);
    const report = analyzeAffiliateEntityActionQuality({ page, mapping, candidates });

    expect(report).toMatchObject({ schemaVersion: 1, isValid: true, issues: [] });
  });
});

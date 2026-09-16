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

const canonicalArticleMapping: AffiliateScrapeMapping = {
  ...articleMapping,
  fields: {
    ...articleMapping.fields,
    officialActionUrl: { selector: ':scope', mode: 'literal', value: articleUrl },
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
  it('rejects a primary editorial CLUB even when its action is the canonical self URL', () => {
    const url = 'https://news.example/editorial/club-teams';
    const page = pageFor(url, `
      <html><head>
        <meta property="og:type" content="article">
        <link rel="canonical" href="${url}">
        <script type="application/ld+json">
          {"@type":"Article","url":"${url}","headline":"Club teams expand"}
        </script>
      </head><body><main>
        <article class="article club-card">
          <h1 class="title">Club teams expand</h1>
          <p>The latest club-team news and analysis.</p>
          <a class="action" href="${url}">Read the editorial</a>
        </article>
      </main></body></html>
    `);
    const report = analyzeAffiliateEntityActionQuality({
      page,
      mapping: clubMappingFor(url),
      candidates: [candidateFor('Club teams expand', url, url)],
    });

    expect(report).toMatchObject({ schemaVersion: 1, isValid: false, sourceDocumentKind: 'ARTICLE' });
    expect(report.issues).toContainEqual(expect.objectContaining({
      code: 'DOCUMENT_ENTITY_MISMATCH',
      candidateIndex: 0,
    }));
  });

  it('rejects article self-links with OG-only metadata despite publisher organization evidence', () => {
    const page = {
      ...articlePage,
      body: articlePage.body.replace(
        /<script type="application\/ld\+json">[\s\S]*?<\/script>/,
        `<script type="application/ld+json">{"@type":"Organization","url":"${articleUrl}","name":"College Football Publisher"}</script>`,
      ),
    };
    const candidates = extractAffiliateCandidatesFromPage(page, canonicalArticleMapping);
    const report = analyzeAffiliateEntityActionQuality({ page, mapping: canonicalArticleMapping, candidates });
    expect(report).toMatchObject({ isValid: false, sourceDocumentKind: 'ARTICLE' });
    expect(report.issues).toContainEqual(expect.objectContaining({ code: 'DOCUMENT_ENTITY_MISMATCH' }));
  });

  it('rejects self-links in wrapped posts with headline-bound Article metadata', () => {
    const page = {
      ...articlePage,
      body: articlePage.body
        .replace('<meta property="og:type" content="article">', '')
        .replace(/,"url":"[^"]+"/, '')
        .replace('<article class="article post">', '<div class="layout"><article class="post">')
        .replace('</main>', '</div></main>'),
    };
    const mapping = { ...canonicalArticleMapping, itemSelector: 'article.post' };
    const candidates = extractAffiliateCandidatesFromPage(page, mapping);
    const report = analyzeAffiliateEntityActionQuality({ page, mapping, candidates });
    expect(report).toMatchObject({ isValid: false, sourceDocumentKind: 'ARTICLE' });
    expect(report.issues).toContainEqual(expect.objectContaining({ code: 'DOCUMENT_ENTITY_MISMATCH' }));
  });

  it('does not treat action words in an Article self-link as a club action', () => {
    const url = 'https://news.example/registration-opens-for-river-club';
    const page = pageFor(url, `
      <head><meta property="og:type" content="article"></head>
      <main class="club-card"><h1 class="title">Registration opens for River Club</h1>
        <p>The latest club registration news.</p><a class="action" href="${url}">Register</a>
      </main>
    `);
    const mapping = clubMappingFor(url);
    const candidates = extractAffiliateCandidatesFromPage(page, mapping);
    expect(analyzeAffiliateEntityActionQuality({ page, mapping, candidates }).issues)
      .toContainEqual(expect.objectContaining({ code: 'DOCUMENT_ENTITY_MISMATCH', candidateIndex: 0 }));
  });

  it('requires club action evidence for an Article identified only by @id', () => {
    const url = 'https://news.example/club-expansion';
    const page = pageFor(url, `
      <head><script type="application/ld+json">{"@type":"Article","@id":"${url}#article"}</script></head>
      <main class="club-card"><h1 class="title">Club expansion</h1>
        <p>Several schools announced new teams.</p><a class="action" href="${url}">Read story</a>
      </main>
    `);
    const mapping = clubMappingFor(url);
    const candidates = extractAffiliateCandidatesFromPage(page, mapping);
    const report = analyzeAffiliateEntityActionQuality({ page, mapping, candidates });
    expect(report).toMatchObject({ isValid: false, sourceDocumentKind: 'ARTICLE' });
    expect(report.issues).toContainEqual(expect.objectContaining({ code: 'DOCUMENT_ENTITY_MISMATCH' }));
  });

  it('does not override an unrelated Article @id with a matching headline', () => {
    const url = 'https://river-club.example/';
    const page = pageFor(url, `
      <head><meta property="og:type" content="website">
        <script type="application/ld+json">{"@type":"Article","@id":"${url}news/river-club","headline":"River Club"}</script>
      </head><main class="club-card"><h1 class="title">River Club</h1>
        <p>We offer indoor volleyball programs.</p><a class="action" href="${url}">Club home</a>
      </main>
    `);
    const mapping = clubMappingFor(url);
    const candidates = extractAffiliateCandidatesFromPage(page, mapping);
    expect(analyzeAffiliateEntityActionQuality({ page, mapping, candidates })).toMatchObject({
      isValid: true, sourceDocumentKind: 'OTHER', issues: [],
    });
  });

  it('accepts canonical club information backed by an Organization @id', () => {
    const url = 'https://river-club.example/';
    const page = pageFor(url, `
      <head><meta property="og:type" content="article">
        <script type="application/ld+json">{"@type":"SportsOrganization","@id":"${url}#organization","name":"River Club"}</script>
      </head><main class="club-card"><h1 class="title">River Club</h1>
        <p>We offer indoor volleyball programs.</p><a class="action" href="${url}">Club home</a>
      </main>
    `);
    const mapping = clubMappingFor(url);
    const candidates = extractAffiliateCandidatesFromPage(page, mapping);
    expect(analyzeAffiliateEntityActionQuality({ page, mapping, candidates })).toMatchObject({
      isValid: true, sourceDocumentKind: 'ARTICLE', issues: [],
    });
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

  it('treats generic article SEO metadata as informational on a club page', () => {
    const url = 'https://river-club.example/';
    const page = pageFor(url, `
      <html><head>
        <meta property="og:type" content="article">
        <script type="application/ld+json">{"@type":"WebPage","url":"${url}","name":"River Club"}</script>
      </head><body><main class="club-card">
        <h1 class="title">River Club</h1><p>Our club offers indoor volleyball programs.</p>
        <a class="action" href="/register">Register for River Club</a>
      </main></body></html>
    `);
    const mapping = clubMappingFor(url);
    const candidates = extractAffiliateCandidatesFromPage(page, mapping);
    expect(analyzeAffiliateEntityActionQuality({ page, mapping, candidates })).toMatchObject({
      isValid: true, sourceDocumentKind: 'ARTICLE', issues: [],
    });
  });

  it('accepts a CMS club article with an evidenced registration action', () => {
    const url = 'https://river-club.example/';
    const page = pageFor(url, `
      <head>
        <meta property="og:type" content="article">
        <script type="application/ld+json">{"@type":"Article","url":"${url}","headline":"River Club"}</script>
      </head><body><main><article class="article club-card">
        <h1 class="title">River Club</h1>
        <p>Our club offers indoor volleyball programs.</p>
        <a class="action" href="/register">Register for River Club</a>
      </article></main></body>
    `);
    const mapping = clubMappingFor(url);
    const candidates = extractAffiliateCandidatesFromPage(page, mapping);
    expect(analyzeAffiliateEntityActionQuality({ page, mapping, candidates })).toMatchObject({
      isValid: true, sourceDocumentKind: 'ARTICLE', issues: [],
    });
  });
  it('accepts North Carolina Tigers club evidence with generic article metadata', () => {
    const url = 'https://aussierulesusa.com/clubs/north-carolina-tigers-144/';
    const actionUrl = 'https://www.playhq.com/afl/org/north-carolina-tigers/2a4e8e1f/register';
    const page = pageFor(url, `
      <html><head>
        <meta property="og:type" content="article">
        <meta property="og:url" content="${url}">
        <link rel="canonical" href="${url}">
        <script type="application/ld+json">
          {"@context":"https://schema.org","@graph":[
            {"@type":"WebPage","@id":"${url}","url":"${url}","name":"North Carolina Tigers - USAFL"},
            {"@type":"SportsOrganization","url":"${url}","name":"North Carolina Tigers"}
          ]}
        </script>
      </head><body><main>
        <div class="club-card">
          <h1 class="title">North Carolina Tigers</h1>
          <p>The North Carolina Tigers Australian Rules Football Club is based in Raleigh, North Carolina.
            The club conducts regular training sessions and participates in all USAFL events.</p>
          <a class="action" href="${actionUrl}">register</a>
          <a class="profile" href="${url}">Club profile</a>
        </div>
      </main></body></html>
    `);
    const mapping = clubMappingFor(url, '.action', 'CLUB');
    const report = analyzeAffiliateEntityActionQuality({
      page,
      mapping,
      candidates: [candidateFor('North Carolina Tigers', actionUrl, url)],
    });

    expect(report).toMatchObject({
      schemaVersion: 1, isValid: true, sourceDocumentKind: 'ARTICLE', issues: [],
    });
    expect(analyzeAffiliateEntityActionQuality({
      page,
      mapping: clubMappingFor(url, '.profile'),
      candidates: [candidateFor('North Carolina Tigers', url, url)],
    })).toMatchObject({ isValid: true, issues: [] });
  });

  it.each([
    [
      'Pier 25',
      'https://www.manhattanyouth.org/sports/volleyball',
      'Beach Volleyball at Pier 25',
      'https://playtomic.io/pier-25-volleyball-manhattan-youth-rec/d6531ecc-55f1-44ca-b374-0443b9ed1cc2?q=BEACH_VOLLEY~2023-03-23~~',
      'Reserve Now',
      'Beach volleyball at Pier 25 courts are available to rent for $100 per hour.',
    ],
    [
      'Commonpoint',
      'https://www.commonpoint.org/turf-field-in-queens-new-york',
      'Turf and Court Rentals',
      'https://www.catchcorner.com/organization-page/embedded/rental/commonpoint-queens---alley-pond/Soccer',
      'Book Turf Online',
      'Our climate-controlled turf field supports soccer, flag football, lacrosse, and baseball rentals.',
    ],
  ])('accepts the %s dedicated rental page despite Article metadata', (
    _name,
    pageUrl,
    title,
    actionUrl,
    actionLabel,
    description,
  ) => {
    const page = pageFor(pageUrl, `
      <html><head>
        <meta property="og:type" content="article">
        <link rel="canonical" href="${pageUrl}">
      </head><body><main>
        <div class="club-card">
          <h1 class="title">${title}</h1>
          <p>${description}</p>
          <a class="action" href="${actionUrl}">${actionLabel}</a>
        </div>
      </main></body></html>
    `);
    const mapping = clubMappingFor(pageUrl, '.action', 'RENTAL');
    const report = analyzeAffiliateEntityActionQuality({
      page,
      mapping,
      candidates: [candidateFor(title, actionUrl, pageUrl, 'RENTAL')],
    });

    expect(report).toMatchObject({
      schemaVersion: 1, isValid: true, sourceDocumentKind: 'ARTICLE', issues: [],
    });
  });


  it('does not classify event content as navigation from page template classes', () => {
    const url = 'https://river-club.example/events';
    const page = pageFor(url, `
      <body class="top-navigation-position-above-banner disable-navigation-border">
        <nav><a href="/about">About</a></nav>
        <main><article class="club-card">
          <h1 class="title">Doubles Tournament</h1>
          <a class="action" href="/payments/doubles">REGISTER HERE</a>
        </article></main>
      </body>
    `);
    const mapping = clubMappingFor(url, '.action', 'EVENT');
    const candidates = extractAffiliateCandidatesFromPage(page, mapping);
    expect(analyzeAffiliateEntityActionQuality({ page, mapping, candidates })).toMatchObject({
      isValid: true, issues: [],
    });
  });
  it.each([
    'class="primary-navigation"',
    'id="site-navigation"',
    'class="mobile-navigation-menu"',
  ])('rejects a candidate action inside %s', (attributes) => {
    const url = 'https://river-club.example/';
    const page = pageFor(url, `
      <main><div class="club-card">
        <h1 class="title">River Club</h1>
        <div ${attributes}><a class="action" href="/register">Register</a></div>
      </div></main>
    `);
    const mapping = clubMappingFor(url);
    const candidates = extractAffiliateCandidatesFromPage(page, mapping);
    expect(analyzeAffiliateEntityActionQuality({ page, mapping, candidates }).issues)
      .toContainEqual(expect.objectContaining({ code: 'ACTION_NAVIGATION', candidateIndex: 0 }));
  });

  it('rejects an action inside an exact class-token navigation wrapper', () => {
    const url = 'https://river-club.example/';
    const page = pageFor(url, `
      <main><div class="club-card">
        <h2 class="title">River Club</h2>
        <div class="main-navigation"><a class="action" href="/register">Register</a></div>
      </div></main>
    `);
    const report = analyzeAffiliateEntityActionQuality({
      page,
      mapping: clubMappingFor(url),
      candidates: [candidateFor('River Club', `${url}register`, url)],
    });

    expect(report.isValid).toBe(false);
    expect(report.issues).toContainEqual(expect.objectContaining({
      code: 'ACTION_NAVIGATION',
      candidateIndex: 0,
    }));
  });
  it('rejects an action inside an ARIA navigation wrapper', () => {
    const url = 'https://river-club.example/';
    const page = pageFor(url, `
      <main><div class="club-card">
        <h2 class="title">River Club</h2>
        <div role="navigation"><a class="action" href="/register">Register</a></div>
      </div></main>
    `);
    const report = analyzeAffiliateEntityActionQuality({
      page,
      mapping: clubMappingFor(url),
      candidates: [candidateFor('River Club', `${url}register`, url)],
    });

    expect(report.isValid).toBe(false);
    expect(report.issues).toContainEqual(expect.objectContaining({
      code: 'ACTION_NAVIGATION',
      candidateIndex: 0,
    }));
  });


  it('ignores navigation substrings on ordinary content wrappers', () => {
    const url = 'https://river-club.example/';
    const page = pageFor(url, `
      <html class="site-navigation-layout"><body id="navigation-template">
        <main><div class="club-card content-navigation-layout" id="content-navigation-settings">
          <h2 class="title">River Club</h2>
          <a class="action" href="/register">Register</a>
        </div></main>
      </body></html>
    `);
    const report = analyzeAffiliateEntityActionQuality({
      page,
      mapping: clubMappingFor(url),
      candidates: [candidateFor('River Club', `${url}register`, url)],
    });

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

/** @jest-environment node */

import { analyzeAffiliateDescriptionQuality } from '../descriptionQuality';

describe('affiliate description quality', () => {
  it('flags discovery narration tied to the named event', () => {
    expect(analyzeAffiliateDescriptionQuality({
      kind: 'EVENT',
      name: 'Brooklyn Summer Casual Mixed League 2026',
      description: 'Brooklyn Summer Casual Mixed League 2026 is listed by DiscNY as a casual mixed summer ultimate league.',
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'DISCOVERY_NARRATION' }),
    ]));
  });

  it('flags generic and named-source discovery narration', () => {
    for (const description of [
      'This event was found on DiscNY.',
      'Summer League was found by our mapping agent.',
      'I found Summer League on DiscNY.',
      'I found Summer League.',
      'Our team mapped Summer League.',
      'Listed by our agent.',
      'The record was posted at the public listing.',
    ]) {
      expect(analyzeAffiliateDescriptionQuality({
        kind: 'EVENT',
        name: 'Summer League',
        description,
      })).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'DISCOVERY_NARRATION' }),
      ]));
    }
  });

  it('recognizes punctuated organization names without splitting their discovery clause', () => {
    expect(analyzeAffiliateDescriptionQuality({
      kind: 'ORGANIZATION',
      name: 'St. John Club',
      description: 'Youth programs run weekly. St. John Club was found on DiscNY.',
    })).toEqual([expect.objectContaining({ code: 'DISCOVERY_NARRATION' })]);
  });

  it('separates first-party publishing from agent discovery', () => {
    expect(analyzeAffiliateDescriptionQuality({
      kind: 'ORGANIZATION',
      name: 'Community Club',
      description: 'We published our summer schedule. Our website lists league schedules and match results.',
    })).toEqual([]);
    expect(analyzeAffiliateDescriptionQuality({
      kind: 'EVENT',
      name: 'Summer League',
      description: 'We found the event on DiscNY.',
    })).toEqual([expect.objectContaining({ code: 'DISCOVERY_NARRATION' })]);
  });

  it('preserves natural source wording even when it starts with the event name', () => {
    expect(analyzeAffiliateDescriptionQuality({
      kind: 'EVENT',
      name: 'Brooklyn Summer Casual Mixed League 2026',
      description: 'Brooklyn Summer Casual Mixed League 2026 is a casual mixed ultimate league with weekly summer play in New York City.',
    })).toEqual([]);
  });

  it('flags organization discovery narration without rejecting a natural organization name', () => {
    expect(analyzeAffiliateDescriptionQuality({
      kind: 'ORGANIZATION',
      name: 'DiscNY',
      description: 'The official website lists DiscNY as a New York ultimate organization.',
    })).toEqual([expect.objectContaining({ code: 'DISCOVERY_NARRATION' })]);
    expect(analyzeAffiliateDescriptionQuality({
      kind: 'ORGANIZATION',
      name: 'DiscNY',
      description: 'DiscNY organizes leagues, tournaments, and community ultimate programs across New York City.',
    })).toEqual([]);
  });

  it('preserves first-party participation instructions instead of treating them as discovery notes', () => {
    for (const description of [
      'Players must be listed by a coach before Friday.',
      'Players must be listed on the team roster.',
      'Listed by a coach before Friday, players may compete.',
      'Listed on the team roster, players may compete.',
      'Visit our official website to register.',
    ]) {
      expect(analyzeAffiliateDescriptionQuality({
        kind: 'EVENT',
        name: 'Summer League',
        description,
      })).toEqual([]);
    }
    expect(analyzeAffiliateDescriptionQuality({
      kind: 'ORGANIZATION',
      name: 'DiscNY',
      description: 'The stored homepage describes weekly games for local players.',
    })).toEqual([expect.objectContaining({ code: 'DISCOVERY_NARRATION' })]);
  });

  it('flags URL-only descriptions while preserving ordinary prose containing a URL', () => {
    for (const description of [
      'https://example.test/events/summer-league',
      '//example.test/events/summer-league',
      '/events/summer-league',
      'www.example.test/events/summer-league',
      'example.test/events/summer-league',
    ]) {
      expect(analyzeAffiliateDescriptionQuality({
        kind: 'EVENT',
        name: 'Summer League',
        description,
      })).toEqual([expect.objectContaining({ code: 'URL_DESCRIPTION' })]);
    }
    expect(analyzeAffiliateDescriptionQuality({
      kind: 'EVENT',
      name: 'Summer League',
      description: 'Visit https://example.test/events/summer-league to register.',
    })).toEqual([]);
  });


  it('flags a missing description', () => {
    expect(analyzeAffiliateDescriptionQuality({
      kind: 'EVENT',
      name: 'Summer League',
      description: null,
    })).toEqual([expect.objectContaining({ code: 'MISSING_DESCRIPTION' })]);
  });
});

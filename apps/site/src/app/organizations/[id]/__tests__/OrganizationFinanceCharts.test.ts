import { summarizeRevenue } from '../OrganizationFinanceCharts';

it('groups revenue by service date and category without mixing refunds or undated data into the trend', () => {
  expect(summarizeRevenue([
    { id: 'a', classification: 'revenue', amountCents: 5000, category: 'Events', serviceStartAt: '2026-09-02T10:00:00Z' },
    { id: 'b', classification: 'revenue', amountCents: 2500, category: 'Events', serviceStartAt: '2026-09-02T12:00:00Z' },
    { id: 'c', classification: 'refund', amountCents: -1000, category: 'Events', serviceStartAt: '2026-09-02T10:00:00Z' },
    { id: 'd', classification: 'revenue', amountCents: 3000, category: 'Rentals', serviceStartAt: 'invalid' },
    { id: 'e', classification: 'revenue', amountCents: 1000, category: 'Events', serviceStartAt: '2026-09-01T10:00:00Z' },
  ])).toEqual({ dates: [{ date: '2026-09-01', amount: 1000 }, { date: '2026-09-02', amount: 7500 }], categories: [{ name: 'Events', amount: 8500 }, { name: 'Rentals', amount: 3000 }] });
});

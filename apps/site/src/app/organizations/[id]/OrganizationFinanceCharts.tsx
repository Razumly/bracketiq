'use client';

import { OrganizationDataRegion } from '@/components/organization/OrganizationDataLoading';

type RevenueItem = { id: string; classification: string; amountCents: number; category: string; serviceStartAt?: string | null };
const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100);

export function summarizeRevenue(items: RevenueItem[]) {
  const dates = new Map<string, number>();
  const categories = new Map<string, number>();
  for (const item of items) {
    if (item.classification !== 'revenue' || item.amountCents <= 0) continue;
    categories.set(item.category, (categories.get(item.category) || 0) + item.amountCents);
    if (item.serviceStartAt && Number.isFinite(Date.parse(item.serviceStartAt))) {
      const date = item.serviceStartAt.slice(0, 10);
      dates.set(date, (dates.get(date) || 0) + item.amountCents);
    }
  }
  return {
    dates: Array.from(dates, ([date, amount]) => ({ date, amount })).sort((a, b) => a.date.localeCompare(b.date)),
    categories: Array.from(categories, ([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount),
  };
}

function RevenueTrend({ dates }: { dates: ReturnType<typeof summarizeRevenue>['dates'] }) {
  if (!dates.length) return <p className="org-empty-copy">No dated revenue in this range.</p>;
  const max = Math.max(...dates.map((point) => point.amount), 1);
  const points = dates.map((point, index) => ({ ...point, x: 65 + index * 610 / Math.max(dates.length - 1, 1), y: 178 - point.amount / max * 140 }));
  return <>
    <svg viewBox="0 0 720 215" role="img" aria-label="Revenue by service date. Exact amounts are in the table below.">
      {[0, .5, 1].map((fraction) => <g key={fraction}><line x1="65" x2="690" y1={178 - fraction * 140} y2={178 - fraction * 140} stroke="var(--bq-border)" strokeDasharray="4 4" /><text x="2" y={182 - fraction * 140} fontSize="11" fill="currentColor">{money(max * fraction)}</text></g>)}
      <polyline points={points.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke="var(--primary)" strokeWidth="2.5" />
      {points.map((point) => <circle key={point.date} cx={point.x} cy={point.y} r="4" fill="var(--primary)"><title>{point.date}: {money(point.amount)}</title></circle>)}
      <text x="65" y="205" fontSize="11" fill="currentColor">{dates[0].date}</text><text x="690" y="205" textAnchor="end" fontSize="11" fill="currentColor">{dates[dates.length - 1].date}</text>
    </svg>
    <details className="org-chart-data"><summary>View revenue data</summary><table><thead><tr><th>Service date</th><th>Revenue</th></tr></thead><tbody>{dates.map((point) => <tr key={point.date}><td>{point.date}</td><td>{money(point.amount)}</td></tr>)}</tbody></table></details>
  </>;
}

export default function OrganizationFinanceCharts({ items, unavailable = false }: { items: RevenueItem[]; unavailable?: boolean }) {
  const { dates, categories } = summarizeRevenue(items);
  const total = categories.reduce((sum, category) => sum + category.amount, 0);
  return <div className="org-finance-charts">
    <section className="org-reference-card"><h3>Revenue by service date</h3><OrganizationDataRegion label="revenue trend" layout="detail">{!unavailable && <RevenueTrend dates={dates} />}</OrganizationDataRegion></section>
    <section className="org-reference-card"><h3>Revenue breakdown</h3>
      <OrganizationDataRegion label="revenue breakdown" layout="detail">
      {categories.length ? <div className="org-revenue-categories">{categories.map((category) => <div key={category.name}>
        <div><span>{category.name}</span><strong>{money(category.amount)}</strong></div>
        <meter min={0} max={total} value={category.amount} aria-label={`${category.name} revenue`} />
        <small>{Math.round(category.amount / total * 100)}% of revenue</small>
      </div>)}</div> : !unavailable && <p className="org-empty-copy">No revenue in this range.</p>}
      </OrganizationDataRegion>
    </section>
  </div>;
}

'use client';

import { Select } from '@/components/organization/organization-operation-ui';

const hours = Array.from({ length: 12 }, (_, index) => String(index + 1));
const minutes = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'));

export function RentalSlotClockInput({ label, value, onChange, disabled }: {
  label: string; value: string; onChange: (value: string) => void; disabled?: boolean;
}) {
  const [hour, minute] = value.split(':').map(Number);
  const period = hour >= 12 ? 'PM' : 'AM';
  const update = (nextHour: number, nextMinute: number, nextPeriod: string) => {
    const normalizedHour = nextHour % 12 + (nextPeriod === 'PM' ? 12 : 0);
    onChange(`${String(normalizedHour).padStart(2, '0')}:${String(nextMinute).padStart(2, '0')}`);
  };
  return <fieldset disabled={disabled} className="min-w-0 flex-1">
    <legend className="mb-2 text-sm font-medium">{label}</legend>
    <div className="grid grid-cols-3 gap-2">
      <Select aria-label={`${label} hour`} data={hours} value={String(hour % 12 || 12)} disabled={disabled} allowDeselect={false} onChange={(next) => { if (next) update(Number(next), minute, period); }} />
      <Select aria-label={`${label} minute`} data={minutes} value={String(minute).padStart(2, '0')} disabled={disabled} allowDeselect={false} onChange={(next) => { if (next) update(hour, Number(next), period); }} />
      <Select aria-label={`${label} period`} data={['AM', 'PM']} value={period} disabled={disabled} allowDeselect={false} onChange={(next) => { if (next) update(hour, minute, next); }} />
    </div>
  </fieldset>;
}

'use client';

import type { ReactNode } from 'react';
import { Building2, CalendarDays, CircleDot, Clock3 } from 'lucide-react';
import { OrganizationStatStrip } from '@/components/organization/OrganizationTabLayout';
import type { Facility } from '@/types';
import type { CalendarEventData } from './facilityCalendarTypes';

type Props = {
  loading?: boolean;
  facilities: Facility[];
  resourceCount: number;
  events: CalendarEventData[];
  children: ReactNode;
};

function countBookings(events: CalendarEventData[]) {
  return new Set(events.filter((event) => event.metaType === 'booked' || (event.metaType === 'facility-feed' && (event.feedType === 'event' || event.feedType === 'game'))).map((event) => event.id)).size;
}

export default function FacilityScheduleLayout({ facilities, resourceCount, events, children, loading }: Props) {
  const rentals = events.filter((event) => event.metaType === 'rental');
  return (
    <div className="org-facility-layout">
      <div className="org-facility-main">
        <OrganizationStatStrip loading={loading} items={[
          { label: 'facilities', value: facilities.length, icon: <Building2 /> },
          { label: 'resources', value: resourceCount, icon: <CircleDot /> },
          { label: 'bookings in view', value: countBookings(events), icon: <CalendarDays /> },
          { label: 'open slots in view', value: rentals.length, icon: <Clock3 /> },
        ]} />
        {children}
      </div>
    </div>
  );
}

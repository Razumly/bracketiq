'use client';

import Image from 'next/image';
import { useState } from 'react';
import { CalendarDays, CircleDot, MapPin, Users } from 'lucide-react';
import { formatEnumDisplayLabel } from '@/lib/enumUtils';
import { normalizeTimeZone } from '@/lib/dateUtils';
import { resolveEventParticipantCapacity } from '@/lib/eventCapacity';
import { formatAffiliateEventPriceRange, formatEventDivisionPriceRange, getEventImageFallbackUrl, getEventImageUrl, type Event } from '@/types';

type DisplaySchedule = {
  start: string;
  end: string | null;
  timeZone?: string;
};

function getDisplaySchedule(event: Event): DisplaySchedule {
  if (!event.nextOccurrence) {
    return { start: event.start, end: event.end };
  }

  return {
    start: event.nextOccurrence.start,
    end: event.nextOccurrence.end,
    timeZone: event.nextOccurrence.timeZone ?? event.timeZone ?? 'UTC',
  };
}

function formatScheduleDate(value: string, timeZone?: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...(timeZone ? { timeZone: normalizeTimeZone(timeZone) } : {}),
  });
}

function eventDate(event: Event): string {
  if (event.dateDisplayMode === 'NO_FIXED_DATE' || event.dateDisplayMode === 'ONGOING') return event.dateDisplayText || event.scheduleText || 'No fixed start date';
  const schedule = getDisplaySchedule(event);
  const first = formatScheduleDate(schedule.start, schedule.timeZone);
  if (!first) return 'Date to be announced';
  const last = schedule.end ? formatScheduleDate(schedule.end, schedule.timeZone) : null;
  if (!last || first === last) return first;
  return `${first} – ${last}`;
}

function eventStatus(event: Event, capacity: number): string {
  if (['DRAFT', 'UNPUBLISHED'].includes(String(event.state))) return 'Draft';
  if (event.state === 'PRIVATE') return 'Private';
  const end = getDisplaySchedule(event).end;
  if (end && Date.parse(end) < Date.now()) return 'Completed';
  if (capacity > 0 && event.attendees >= capacity) return 'Registration full';
  return event.statusText || 'Registration open';
}

function eventAttendance(event: Event, capacity: number): string {
  const capacityLabel = capacity > 0 ? ' / ' + capacity : '';
  const participantLabel = event.teamSignup ? 'teams' : 'players';
  return `${event.attendees ?? 0}${capacityLabel} ${participantLabel}`;
}

export default function OrganizationEventCard({ event, onClick }: { event: Event; onClick: () => void }) {
  const [imageIndex, setImageIndex] = useState(0);
  const fallback = getEventImageFallbackUrl({ event, width: 640, height: 240, fit: 'inside' });
  const primaryImage = getEventImageUrl({ imageId: event.imageId, width: 640, height: 240, placeholderUrl: fallback });
  const initialsFallback = `/api/avatars/initials?name=${encodeURIComponent(event.name)}&size=640`;
  const imageSources = Array.from(new Set([primaryImage, fallback, initialsFallback]));
  const image = imageSources[Math.min(imageIndex, imageSources.length - 1)];
  const capacity = resolveEventParticipantCapacity(event);
  const price = event.affiliateUrl ? formatAffiliateEventPriceRange(event) : formatEventDivisionPriceRange(event);
  const sport = typeof event.sport === 'object' ? event.sport.name : event.sport;
  return (
    <button type="button" className="org-event-card" onClick={onClick} aria-label={event.name}>
      <span className="org-event-card-image">
        <Image
          src={image}
          alt=""
          fill
          unoptimized
          sizes="(max-width: 767px) 100vw, (max-width: 1199px) 50vw, 33vw"
          className={event.imageId && imageIndex === 0 ? 'object-cover' : 'object-contain'}
          onError={imageIndex < imageSources.length - 1 ? () => setImageIndex((current) => current + 1) : undefined}
        />
      </span>
      <span className="org-event-card-body">
        <strong className="org-event-card-title">{event.name}</strong>
        <span className="org-event-card-kind"><span><CircleDot />{sport}</span><span>{formatEnumDisplayLabel(event.eventType, 'Event')}</span></span>
        <span className="org-event-card-facts">
          <span><CalendarDays />{eventDate(event)}</span>
          <span className="org-event-card-status">{eventStatus(event, capacity)}</span>
          <span><MapPin />{event.location || 'Location to be announced'}</span>
          <span><Users />{eventAttendance(event, capacity)}</span>
        </span>
      </span>
      <span className="org-event-card-price"><strong>{price}</strong><span>{event.teamSignup ? 'per team' : 'per person'}</span></span>
    </button>
  );
}

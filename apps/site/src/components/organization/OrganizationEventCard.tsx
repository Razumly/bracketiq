'use client';

import Image from 'next/image';
import { useState } from 'react';
import { Building2, CalendarDays, CircleDot, MapPin, Users } from 'lucide-react';
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
    return { start: event.start, end: event.end, timeZone: event.timeZone };
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

function formatScheduleTime(value: string, timeZone?: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    ...(timeZone ? { timeZone: normalizeTimeZone(timeZone) } : {}),
  });
}

function eventDate(event: Event): string {
  const displayMode = String(event.dateDisplayMode);
  if (displayMode === 'NO_FIXED_DATE' || displayMode === 'ONGOING') {
    return event.dateDisplayText || event.scheduleText || 'No fixed start date';
  }
  const schedule = getDisplaySchedule(event);
  const first = formatScheduleDate(schedule.start, schedule.timeZone);
  if (displayMode === 'DATE_ONLY') return event.dateDisplayText?.trim() || first || 'Date to be announced';
  if (!first) return 'Date to be announced';
  const last = schedule.end ? formatScheduleDate(schedule.end, schedule.timeZone) : null;
  if (!last || first === last) return first;
  return `${first} – ${last}`;
}

function eventTime(event: Event): string | null {
  if (['NO_FIXED_DATE', 'ONGOING', 'DATE_ONLY'].includes(String(event.dateDisplayMode))) return null;
  const schedule = getDisplaySchedule(event);
  const first = formatScheduleTime(schedule.start, schedule.timeZone);
  if (!first) return null;
  const last = schedule.end ? formatScheduleTime(schedule.end, schedule.timeZone) : null;
  return last && last !== first ? `${first} – ${last}` : first;
}

function eventOrganizer(event: Event): string | null {
  if (event.organizerName?.trim()) return event.organizerName.trim();
  if (typeof event.organization === 'object' && event.organization?.name?.trim()) return event.organization.name.trim();
  return null;
}

function eventStatus(event: Event, capacity: number): string {
  if (['DRAFT', 'UNPUBLISHED'].includes(String(event.state))) return 'Draft';
  if (event.state === 'PRIVATE') return 'Private';
  const end = getDisplaySchedule(event).end;
  if (end && Date.parse(end) < Date.now()) return 'Completed';
  if (capacity > 0 && event.attendees >= capacity) return 'Registration full';
  const statusText = event.statusText?.trim();
  return statusText || 'Registration open';
}

function eventAttendance(event: Event, capacity: number): string {
  const capacityLabel = capacity > 0 ? ' / ' + capacity : '';
  const participantLabel = event.teamSignup ? 'teams' : 'players';
  return `${event.attendees ?? 0}${capacityLabel} ${participantLabel}`;
}

export default function OrganizationEventCard({ event, onClick }: { event: Event; onClick: () => void }) {
  const [imageIndex, setImageIndex] = useState(0);
  const fallback = getEventImageFallbackUrl({ event, width: 640, height: 280, fit: 'inside' });
  const primaryImage = getEventImageUrl({
    imageId: event.imageId,
    width: 640,
    height: 280,
    placeholderUrl: fallback,
    fit: 'cover',
  });
  const initialsFallback = `/api/avatars/initials?name=${encodeURIComponent(event.name)}&size=640`;
  const imageSources = Array.from(new Set([primaryImage, fallback, initialsFallback]));
  const image = imageSources[Math.min(imageIndex, imageSources.length - 1)];
  const imageIsFallback = !event.imageId || imageIndex > 0;
  const capacity = resolveEventParticipantCapacity(event);
  const price = event.affiliateUrl ? formatAffiliateEventPriceRange(event) : formatEventDivisionPriceRange(event);
  const sport = typeof event.sport === 'object' ? event.sport.name : event.sport;
  const time = eventTime(event);
  const organizer = eventOrganizer(event);
  const registrationLabel = event.affiliateUrl
    ? 'External registration'
    : event.teamSignup
      ? 'Team registration'
      : 'Individual registration';

  return (
    <button type="button" className="org-event-card" onClick={onClick} aria-label={event.name}>
      <span className="org-event-card-image">
        <Image
          src={image}
          alt=""
          fill
          unoptimized
          sizes="(max-width: 767px) 100vw, (max-width: 1199px) 50vw, 33vw"
          className={imageIsFallback ? 'object-contain' : 'object-cover'}
          onError={imageIndex < imageSources.length - 1 ? () => setImageIndex((current) => current + 1) : undefined}
        />
        {event.affiliateUrl && <span className="org-event-card-image-badge">External registration</span>}
      </span>
      <span className="org-event-card-body">
        <strong className="org-event-card-title">{event.name}</strong>
        <span className="org-event-card-kind">
          <span className="org-event-card-kind-sport"><CircleDot aria-hidden="true" />{sport}</span>
          <span>{formatEnumDisplayLabel(event.eventType, 'Event')}</span>
          <span>{registrationLabel}</span>
        </span>
        <span className="org-event-card-status">{eventStatus(event, capacity)}</span>
        <span className="org-event-card-facts">
          <span className="org-event-card-fact">
            <CalendarDays aria-hidden="true" />
            <span className="org-event-card-fact-copy">
              <span>{eventDate(event)}</span>
              {time && <span className="org-event-card-time">{time}</span>}
            </span>
          </span>
          <span className="org-event-card-fact">
            <MapPin aria-hidden="true" />
            <span className="org-event-card-fact-copy">{event.location || 'Location to be announced'}</span>
          </span>
          {organizer && (
            <span className="org-event-card-fact">
              <Building2 aria-hidden="true" />
              <span className="org-event-card-fact-copy">Hosted by {organizer}</span>
            </span>
          )}
        </span>
      </span>
      <span className="org-event-card-price">
        <span className="org-event-card-price-copy">
          <strong>{price}</strong>
          <span>{event.teamSignup ? 'per team' : 'per person'}</span>
        </span>
        <span className="org-event-card-attendance">
          <Users aria-hidden="true" />
          {eventAttendance(event, capacity)}
        </span>
      </span>
    </button>
  );
}

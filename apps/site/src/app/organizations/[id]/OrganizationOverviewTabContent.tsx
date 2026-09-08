'use client';

import Image from 'next/image';
import {
  CalendarDays,
  ChevronRight,
  CircleDot,
  Globe2,
  Mail,
  MapPin,
  Phone,
  Star,
  UserRound,
  UsersRound,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { OrganizationDataRegion, OrganizationLoadingValue } from '@/components/organization/OrganizationDataLoading';

import {
  Avatar,
  Button,
  Group,
  Paper,
  Stack,
  Text,
  Title,
} from '@/components/organization/organization-operation-ui';
import type { Event, Organization, Team, Division } from '@/types';
import { teamDivisionLabel } from './organizationTeamLabels';
import { getEventImageFallbackUrl, getEventImageUrl, getTeamAvatarUrl } from '@/types';

type OrganizationOverviewTabContentProps = {
  organization: Organization;
  events: Event[];
  teams: Team[];
  staffCount: number;
  officialCount: number;
  reviewContent: ReactNode;
  paymentsContent?: ReactNode;
  canViewEvents: boolean;
  canViewTeams: boolean;
  onViewEvents: () => void;
  onViewTeams: () => void;
  onViewReviews: () => void;
  onEventClick: (event: Event) => void;
};

type OrganizationContactFields = Organization & {
  email?: string | null;
  phone?: string | null;
  contactEmail?: string | null;
  phoneNumber?: string | null;
};

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});
const dateWithYearFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const formatOverviewDateRange = (event: Event): string => {
  const start = new Date(event.start);
  if (Number.isNaN(start.getTime())) return 'Date to be announced';
  const end = event.end ? new Date(event.end) : null;
  if (!end || Number.isNaN(end.getTime())) return dateWithYearFormatter.format(start);
  if (start.toDateString() === end.toDateString()) return dateWithYearFormatter.format(start);
  return `${dateFormatter.format(start)} – ${dateWithYearFormatter.format(end)}`;
};

const formatOverviewTime = (event: Event): string => {
  const start = new Date(event.start);
  if (Number.isNaN(start.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(start);
};

const formatWebsiteLabel = (website: string): string => {
  try {
    return new URL(website).hostname.replace(/^www\./, '');
  } catch {
    return website.replace(/^https?:\/\//, '').replace(/\/$/, '');
  }
};

const getTeamRosterCount = (team: Team): number => {
  if (typeof team.currentSize === 'number' && Number.isFinite(team.currentSize)) {
    return Math.max(0, Math.trunc(team.currentSize));
  }
  return Array.isArray(team.players) ? team.players.length : team.playerIds.length;
};

const getEventStatusLabel = (event: Event): string => {
  const normalizedState = String(event.state ?? '').toUpperCase();
  if (normalizedState === 'DRAFT' || normalizedState === 'UNPUBLISHED') return 'Draft';
  if (normalizedState === 'PRIVATE') return 'Private';
  if (event.status === 'completed') return 'Completed';
  return 'Registration open';
};

function OverviewEventRow({ event, onClick }: { event: Event; onClick: () => void }) {
  const hasImage = Boolean(event.imageId?.trim());
  const imagePlaceholderUrl = getEventImageFallbackUrl({
    event,
    width: 320,
    height: 180,
    fit: 'inside',
  });
  const imageUrl = getEventImageUrl({
    imageId: event.imageId,
    width: 320,
    height: 180,
    placeholderUrl: imagePlaceholderUrl,
    fit: 'inside',
  });

  return (
    <button
      type="button"
      className="org-overview-event-row group"
      onClick={onClick}
      aria-label={`Open ${event.name}`}
    >
      <div className="org-overview-event-image">
        <Image
          src={imageUrl}
          alt=""
          fill
          unoptimized
          sizes="(max-width: 767px) 36vw, 88px"
          className={hasImage ? 'object-cover' : 'object-contain'}
        />
      </div>
      <div className="org-overview-event-main">
        <Text component="span" className="org-overview-event-title" fw={700}>{event.name}</Text>
        <span className="org-overview-event-meta">
          <CalendarDays aria-hidden="true" className="size-4 shrink-0" />
          <span>{formatOverviewDateRange(event)}</span>
          {formatOverviewTime(event) && <span className="hidden sm:inline">· {formatOverviewTime(event)}</span>}
        </span>
        <span className="org-overview-event-meta hidden sm:flex">
          <MapPin aria-hidden="true" className="size-4 shrink-0" />
          <span className="truncate">{event.location || 'Location to be announced'}</span>
        </span>
        <span className="org-overview-event-status">{getEventStatusLabel(event)}</span>
      </div>
      <ChevronRight aria-hidden="true" className="org-overview-event-arrow size-6 shrink-0" />
    </button>
  );
}

function OverviewTeamCard({ team, divisions }: { team: Team; divisions?: Division[] }) {
  return (
    <Paper withBorder className="org-overview-team-card">
      <Group align="flex-start" gap="sm" wrap="nowrap">
        <Avatar
          src={getTeamAvatarUrl(team, 64)}
          alt={`${team.name || 'Team'} logo`}
          size={64}
          radius="xl"
        />
        <div className="min-w-0 flex-1">
          <Text fw={700} className="truncate">{team.name || 'Unnamed team'}</Text>
          <Text size="xs" c="dimmed" mt={4}>Division</Text>
          <Text size="sm" className="truncate">{teamDivisionLabel(team, divisions)}</Text>
          <Text size="xs" c="dimmed" mt={6}>Roster</Text>
          <Text size="sm">{getTeamRosterCount(team)} athletes</Text>
        </div>
        <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
      </Group>
    </Paper>
  );
}

function organizationContact(organization: OrganizationOverviewTabContentProps['organization']) {
  const contact = organization as OrganizationContactFields;
  return {
    email: contact.contactEmail?.trim() || contact.email?.trim(),
    phone: contact.phone?.trim() || contact.phoneNumber?.trim(),
  };
}

function OverviewOrganizationDetails({ organization }: Pick<OrganizationOverviewTabContentProps, 'organization'>) {
  const { email, phone } = organizationContact(organization);
  const sports = organization.sports?.filter((sport) => sport.trim()) ?? [];
  return (
  <Paper withBorder className="org-overview-detail-card">
    <Title order={3}>Organization details</Title>
    <Stack gap="sm" mt="md">
      {organization.website && (
        <a className="org-overview-detail-row" href={organization.website} target="_blank" rel="noreferrer">
          <Globe2 aria-hidden="true" className="size-5 shrink-0" />
          <span>Website</span>
          <span className="org-overview-detail-value">{formatWebsiteLabel(organization.website)}</span>
        </a>
      )}
      {email && (
        <a className="org-overview-detail-row" href={`mailto:${email}`}>
          <Mail aria-hidden="true" className="size-5 shrink-0" />
          <span>Email</span>
          <span className="org-overview-detail-value">{email}</span>
        </a>
      )}
      {phone && (
        <a className="org-overview-detail-row" href={`tel:${phone}`}>
          <Phone aria-hidden="true" className="size-5 shrink-0" />
          <span>Phone</span>
          <span className="org-overview-detail-value">{phone}</span>
        </a>
      )}
      {organization.location && (
        <div className="org-overview-detail-row">
          <MapPin aria-hidden="true" className="size-5 shrink-0" />
          <span>Location</span>
          <span className="org-overview-detail-value">{organization.location}</span>
        </div>
      )}
      {sports.length > 0 && (
        <div className="org-overview-detail-row">
          <CircleDot aria-hidden="true" className="size-5 shrink-0" />
          <span>Sports</span>
          <span className="org-overview-detail-value">{sports.join(', ')}</span>
        </div>
      )}
    </Stack>
  </Paper>
  );
}

export default function OrganizationOverviewTabContent({
  organization,
  events,
  teams,
  staffCount,
  officialCount,
  reviewContent,
  paymentsContent,
  canViewEvents,
  canViewTeams,
  onViewEvents,
  onViewTeams,
  onViewReviews,
  onEventClick,
}: OrganizationOverviewTabContentProps) {
  const visibleEvents = events.slice(0, 3);
  const visibleTeams = teams.slice(0, 3);

  return (
    <div className="org-overview-layout">
      <div className="org-overview-primary">
        <Paper withBorder className="org-overview-about">
          <Title order={3}>About {organization.name}</Title>
          <Text className="org-overview-about-copy" component="p">
            {organization.description?.trim() || 'This organization has not added a description yet.'}
          </Text>
          {organization.description && organization.description.length > 220 && (
            <button type="button" className="org-overview-text-link">Read more</button>
          )}
        </Paper>

        <Paper withBorder className="org-overview-events">
          <Group justify="space-between" align="center" className="org-overview-section-heading">
            <Title order={3}>Upcoming events</Title>
            {canViewEvents && (
              <Button variant="link" size="sm" onClick={onViewEvents}>View all events</Button>
            )}
          </Group>
          <OrganizationDataRegion label="upcoming events">
          {visibleEvents.length > 0 ? (
            <div className="org-overview-event-list">
              {visibleEvents.map((event) => (
                <OverviewEventRow key={event.$id} event={event} onClick={() => onEventClick(event)} />
              ))}
            </div>
          ) : (
            <Text c="dimmed">No upcoming events.</Text>
          )}
          </OrganizationDataRegion>
        </Paper>

        <section className="org-overview-glance" aria-labelledby="organization-overview-glance-heading">
          <Title id="organization-overview-glance-heading" order={3}>At a glance</Title>
          <Paper withBorder className="org-overview-glance-card">
            <div className="org-overview-glance-item">
              <UsersRound aria-hidden="true" className="size-8 text-accent" />
              <Text className="org-overview-glance-value" fw={700}><OrganizationLoadingValue>{teams.length}</OrganizationLoadingValue></Text>
              <Text c="dimmed">Teams</Text>
            </div>
            <div className="org-overview-glance-item">
              <UserRound aria-hidden="true" className="size-8 text-accent" />
              <Text className="org-overview-glance-value" fw={700}><OrganizationLoadingValue>{staffCount}</OrganizationLoadingValue></Text>
              <Text c="dimmed">Staff</Text>
            </div>
            <div className="org-overview-glance-item">
              <Star aria-hidden="true" className="size-8 text-amber-500" />
              <Text className="org-overview-glance-value" fw={700}>—</Text>
              <Text c="dimmed">Rating</Text>
            </div>
          </Paper>
        </section>

        <Paper withBorder className="org-overview-teams">
          <Group justify="space-between" align="center" className="org-overview-section-heading">
            <Title order={3}>Teams</Title>
            {canViewTeams && (
              <Button variant="link" size="sm" onClick={onViewTeams}>View all teams</Button>
            )}
          </Group>
          <OrganizationDataRegion label="teams" layout="cards">
          {visibleTeams.length > 0 ? (
            <div className="org-overview-team-grid">
              {visibleTeams.map((team) => <OverviewTeamCard key={team.$id} team={team} divisions={organization.divisions} />)}
            </div>
          ) : (
            <Text c="dimmed">No teams yet.</Text>
          )}
          </OrganizationDataRegion>
        </Paper>
      </div>

      <aside className="org-overview-secondary">
        <OverviewOrganizationDetails organization={organization} />

        <div className="org-overview-review-card">
          {reviewContent}
          <button type="button" className="org-overview-text-link" onClick={onViewReviews}>View all reviews</button>
        </div>

        <Paper withBorder className="org-overview-staff-card">
          <Title order={3}>Staff &amp; officials</Title>
          <div className="org-overview-staff-grid">
            <div>
              <UsersRound aria-hidden="true" className="size-5 text-muted-foreground" />
              <Text size="sm" c="dimmed" mt={6}>Staff members</Text>
              <Text fw={700}><OrganizationLoadingValue>{staffCount}</OrganizationLoadingValue></Text>
            </div>
            <div>
              <UserRound aria-hidden="true" className="size-5 text-muted-foreground" />
              <Text size="sm" c="dimmed" mt={6}>Certified officials</Text>
              <Text fw={700}><OrganizationLoadingValue>{officialCount}</OrganizationLoadingValue></Text>
            </div>
          </div>
        </Paper>

        {paymentsContent}
      </aside>
    </div>
  );
}

import { Division, Group, Participant, Resource, SchedulableEvent, Team, MINUTE_MS } from './types';
import {
  getDateTimePartsInTimeZone,
  normalizeTimeZone,
  zonedTimeToUtcDate,
} from '@/lib/dateUtils';
import {
  assertOneTimeTimeSlotWithinEventBounds,
  resolveOneTimeTimeSlot,
} from '@/lib/timeSlotAvailability';
import { ScheduleError } from './scheduleErrors';

type ParticipantAvailability = 'AVAILABLE' | 'UNAVAILABLE' | 'TEAM_DUTY';

type SlotWindow = {
  start: Date;
  end: Date;
  groupIds: Set<string> | null;
};

const NOT_ENOUGH_TIME_ALLOTTED_MESSAGE = 'Not enough time is allotted in the configured time slots to schedule this event.';
const PHASE_DIVISION_SUFFIX = /__phase__(league|pool|bracket|playoff)$/;

const overlaps = (startA: Date, endA: Date, startB: Date, endB: Date): boolean =>
  startA.getTime() < endB.getTime() && endA.getTime() > startB.getTime();

const pad2 = (value: number): string => String(value).padStart(2, '0');

export const dateWithMinutesInTimeZone = (
  value: Date,
  minutes: number,
  timeZone: string,
): Date | null => {
  const parts = getDateTimePartsInTimeZone(value, timeZone);
  if (!parts) {
    return null;
  }
  const normalizedMinutes = Math.max(0, Math.trunc(minutes));
  const dayOffset = Math.floor(normalizedMinutes / (24 * 60));
  const minuteOfDay = ((normalizedMinutes % (24 * 60)) + (24 * 60)) % (24 * 60);
  const dateAtNoon = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + dayOffset, 12, 0, 0));
  const dateParts = getDateTimePartsInTimeZone(dateAtNoon, 'UTC');
  if (!dateParts) {
    return null;
  }
  const hours = Math.floor(minuteOfDay / 60);
  const mins = minuteOfDay % 60;
  return zonedTimeToUtcDate(
    `${dateParts.year}-${pad2(dateParts.month)}-${pad2(dateParts.day)}T${pad2(hours)}:${pad2(mins)}:00`,
    timeZone,
  );
};


const isLockedEvent = (event: SchedulableEvent): boolean => {
  return (event as { locked?: boolean }).locked === true;
};

export class Schedule<E extends SchedulableEvent, R extends Resource, P extends Participant, G extends Group> {
  resources: Map<G, R[]>;
  participants: Map<G, P[]>;
  startTime: Date;
  currentTime: Date;
  endTime: Date;
  currentGroups: G[] = [];
  private globalSlots: SlotWindow[] = [];
  private resourceSlots: Map<string, SlotWindow[]> = new Map();
  private hasSlots = false;

  constructor(
    startTime: Date,
    resources: Record<string, R>,
    participants: Record<string, P>,
    groups: G[],
    currentTime?: Date,
    opts?: { endTime?: Date; timeSlots?: Iterable<any> },
  ) {
    this.resources = new Map();
    this.participants = new Map();
    const allResources = Object.values(resources);
    for (const group of groups) {
      const eligibleResources = allResources.filter((resource) => {
        const resourceGroups = resource.getGroups();
        return resourceGroups.length === 0 || resourceGroups.some((candidate) => candidate.id === group.id);
      });
      this.resources.set(group, eligibleResources);
      this.participants.set(
        group,
        Object.values(participants).filter((par) => par.getGroups().some((g) => g.id === group.id)),
      );
    }

    this.startTime = startTime;
    this.currentTime = currentTime ?? startTime;
    this.endTime = opts?.endTime ?? new Date(startTime.getTime() + 30 * 24 * 60 * MINUTE_MS);
    const timeSlots = opts?.timeSlots ? Array.from(opts.timeSlots) : [];
    if (timeSlots.length) {
      this.prepareTimeSlots(timeSlots);
    }
    this.hasSlots = timeSlots.length > 0;
  }
  private resourcesForGroup(group: G): R[] {
    const direct = this.resources.get(group);
    if (direct) return direct;
    for (const [candidate, resources] of this.resources) {
      if (candidate.id === group.id) return resources;
    }
    return [];
  }

  private participantsForGroup(group: G): P[] {
    const direct = this.participants.get(group);
    if (direct) return direct;
    for (const [candidate, participants] of this.participants) {
      if (candidate.id === group.id) return participants;
    }
    return [];
  }

  getParticipantConflicts(): Map<P, E[]> {
    const conflicts = new Map<P, E[]>();
    for (const group of this.currentGroups) {
      const groupParticipants = this.participantsForGroup(group);
      for (const participant of groupParticipants) {
        const participantEvents = participant.getEvents() as E[];
        for (const event of participantEvents) {
          const currentEvents = this.currentEvents(event.start, event.end) as E[];
          for (const currentEvent of currentEvents) {
            if (participantEvents.includes(currentEvent) && currentEvent !== event) {
              const existing = conflicts.get(participant) ?? [];
              if (!existing.includes(currentEvent)) {
                existing.push(currentEvent);
                conflicts.set(participant, existing);
              }
            }
          }
        }
      }
    }
    return conflicts;
  }

  rescheduleFollowingEvents(event: E): void {
    const eventResource = event.getResource();
    if (!eventResource) return;
    const resourceEvents = eventResource.getEvents() as E[];
    const nextIndex = resourceEvents.indexOf(event) + 1;
    const nextEvent = nextIndex < resourceEvents.length ? resourceEvents[nextIndex] : null;
    const eventDependants = event.getDependants() as E[];
    let bufferMs = 0;
    if (nextEvent && eventDependants.includes(nextEvent)) {
      bufferMs = event.bufferMs;
    }
    if (nextEvent) {
      const desiredStart = new Date(event.end.getTime() + bufferMs);
      if (!isLockedEvent(nextEvent) && nextEvent.start.getTime() !== desiredStart.getTime()) {
        this.shiftTimes(nextEvent, desiredStart.getTime() - nextEvent.start.getTime());
      }
    }
    for (const dependant of eventDependants) {
      if (nextEvent && dependant === nextEvent) continue;
      const desiredStart = new Date(event.end.getTime() + event.bufferMs);
      if (!isLockedEvent(dependant) && dependant.start.getTime() !== desiredStart.getTime()) {
        this.shiftTimes(dependant, desiredStart.getTime() - dependant.start.getTime());
      }
    }
  }

  shiftTimes(event: E, shiftMs: number): void {
    if (isLockedEvent(event)) return;
    const resource = event.getResource();
    if (!resource) return;
    const resourceEvents = resource.getEvents() as E[];
    const previousEvents = event.getDependencies() as E[];
    const nextEvents = event.getDependants() as E[];
    const startTimes: number[] = [];
    for (const prev of previousEvents) {
      startTimes.push(prev.end.getTime() + event.bufferMs);
    }
    const currentIndex = resourceEvents.indexOf(event);
    if (currentIndex > 0) {
      const prevResEvent = resourceEvents[currentIndex - 1];
      if (!previousEvents.includes(prevResEvent)) {
        previousEvents.push(prevResEvent);
        startTimes.push(prevResEvent.end.getTime());
      }
    }
    if (currentIndex < resourceEvents.length - 2) {
      const nextResEvent = resourceEvents[currentIndex + 1];
      if (!nextEvents.includes(nextResEvent)) {
        nextEvents.push(nextResEvent);
      }
    }
    const earliestStart = Math.max(...startTimes, event.start.getTime());
    const duration = event.end.getTime() - event.start.getTime();

    if (shiftMs < 0 && event.start.getTime() - earliestStart > 0) {
      event.start = new Date(earliestStart);
      event.end = new Date(earliestStart + duration);
      for (const nextEvent of nextEvents) {
        this.rescheduleFollowingEvents(nextEvent);
      }
    } else if (shiftMs > 0) {
      event.start = new Date(event.start.getTime() + shiftMs);
      event.end = new Date(event.start.getTime() + duration);
      for (const nextEvent of nextEvents) {
        this.rescheduleFollowingEvents(nextEvent);
      }
    }
  }

  freeParticipants(
    group: G,
    start: Date,
    end: Date,
    bufferMs = 0,
  ): P[] {
    let freeParticipants = this.participantsForGroup(group);
    const normalizedBufferMs = Math.max(0, bufferMs);
    const groupResources = this.resourcesForGroup(group);
    for (const resource of groupResources) {
      for (const event of resource.getEvents()) {
        if (
          start.getTime() <
            event.end.getTime() + Math.max(0, event.bufferMs) &&
          end.getTime() + normalizedBufferMs > event.start.getTime()
        ) {
          const busyParticipantIds = new Set(
            event.getParticipants().map((participant) => participant.id),
          );
          freeParticipants = freeParticipants.filter(
            (participant) => !busyParticipantIds.has(participant.id),
          );
        }
      }
    }
    return freeParticipants;
  }

  private groupsShareParticipantPool(left: Group, right: Group): boolean {
    const leftId = left.id.trim().toLowerCase();
    const rightId = right.id.trim().toLowerCase();
    if (leftId === rightId) {
      return true;
    }
    const leftDivision = left instanceof Division ? left : null;
    const rightDivision = right instanceof Division ? right : null;
    const leftSourceId =
      'sourceDivisionId' in left && typeof left.sourceDivisionId === 'string'
        ? left.sourceDivisionId.trim().toLowerCase()
        : null;
    const rightSourceId =
      'sourceDivisionId' in right && typeof right.sourceDivisionId === 'string'
        ? right.sourceDivisionId.trim().toLowerCase()
        : null;
    if (
      leftSourceId === rightId ||
      rightSourceId === leftId ||
      leftDivision?.playoffPlacementDivisionIds.some(
        (divisionId) => divisionId.trim().toLowerCase() === rightId,
      ) ||
      rightDivision?.playoffPlacementDivisionIds.some(
        (divisionId) => divisionId.trim().toLowerCase() === leftId,
      )
    ) {
      return true;
    }
    const leftIsAdvancementPhase =
      leftDivision?.kind === 'PLAYOFF' ||
      leftDivision?.phase === 'PLAYOFF' ||
      leftDivision?.phase === 'BRACKET';
    const rightIsAdvancementPhase =
      rightDivision?.kind === 'PLAYOFF' ||
      rightDivision?.phase === 'PLAYOFF' ||
      rightDivision?.phase === 'BRACKET';
    if (!leftIsAdvancementPhase && !rightIsAdvancementPhase) {
      return false;
    }
    return (
      leftId.replace(PHASE_DIVISION_SUFFIX, '') ===
      rightId.replace(PHASE_DIVISION_SUFFIX, '')
    );
  }

  private participantPoolForCurrentGroups(): P[] {
    const byId = new Map<string, P>();
    for (const group of this.currentGroups) {
      for (const participant of this.participantsForGroup(group)) {
        byId.set(participant.id, participant);
      }
    }
    if (
      !Array.from(byId.values()).some(
        (participant) => participant instanceof Team,
      )
    ) {
      for (const [candidateGroup, participants] of this.participants) {
        if (
          !this.currentGroups.some((currentGroup) =>
            this.groupsShareParticipantPool(currentGroup, candidateGroup),
          )
        ) {
          continue;
        }
        for (const participant of participants) {
          if (participant instanceof Team) {
            byId.set(participant.id, participant);
          }
        }
      }
    }
    if (byId.size) {
      return Array.from(byId.values());
    }
    for (const participants of this.participants.values()) {
      for (const participant of participants) {
        byId.set(participant.id, participant);
      }
    }
    return Array.from(byId.values());
  }

  private participantPoolEvents(start: Date, end: Date): SchedulableEvent[] {
    const events: SchedulableEvent[] = [];
    const visitedResources = new Set<R>();
    const visitedEvents = new Set<SchedulableEvent>();
    for (const resources of this.resources.values()) {
      for (const resource of resources) {
        if (visitedResources.has(resource)) {
          continue;
        }
        visitedResources.add(resource);
        for (const event of resource.getEvents()) {
          if (
            visitedEvents.has(event) ||
            !overlaps(event.start, event.end, start, end) ||
            !event
              .getGroups()
              .some((eventGroup) =>
                this.currentGroups.some((currentGroup) =>
                  this.groupsShareParticipantPool(currentGroup, eventGroup),
                ),
              )
          ) {
            continue;
          }
          visitedEvents.add(event);
          events.push(event);
        }
      }
    }
    return events;
  }

  scheduleEvent(event: E, durationMs: number): void {
    this.scheduleEventWithOptions(event, durationMs);
  }

  scheduleEventWithOptions(
    event: E,
    durationMs: number,
    opts?: {
      canUseCandidate?: (candidate: {
        event: E;
        resource: R;
        start: Date;
        end: Date;
      }) => boolean;
    },
  ): void {
    this.currentGroups = event.getGroups() as G[];
    this.assertPossibleParticipantCapacity(event);
    if (
      !this.currentGroups.some(
        (group) => this.resourcesForGroup(group).length > 0,
      )
    ) {
      const groupIds = this.currentGroups
        .map((group) => group.id)
        .filter((id) => id.length > 0);
      const suffix = groupIds.length ? ` for divisions: ${groupIds.join(", ")}` : "";
      throw new ScheduleError(
        `Unable to schedule event because no fields are available${suffix}.`,
        'RESOURCE',
      );
    }
    let earliestStart = this.getEarliestStartTime(event);
    earliestStart = this.nextValidStartTime(earliestStart, durationMs);

    let sawNamedOfficialCapacityFailure = false;
    let sawTeamDutyCapacityFailure = false;
    while (true) {
      let adjustedStart: Date;
      try {
        adjustedStart = this.nextValidStartTime(earliestStart, durationMs);
      } catch (error) {
        if (sawNamedOfficialCapacityFailure) {
          throw new ScheduleError(
            `${NOT_ENOUGH_TIME_ALLOTTED_MESSAGE} No complete position-eligible assignment is available for the scheduled match.`,
            'NAMED_OFFICIAL_POSITION',
          );
        }
        if (sawTeamDutyCapacityFailure) {
          throw new ScheduleError(
            `${NOT_ENOUGH_TIME_ALLOTTED_MESSAGE} Not enough teams are available to cover match and team-official slots.`,
            'TEAM_DUTY',
          );
        }
        throw error;
      }
      if (adjustedStart.getTime() > earliestStart.getTime()) {
        earliestStart = adjustedStart;
      }
      if (earliestStart.getTime() + durationMs > this.endTime.getTime()) {
        if (sawNamedOfficialCapacityFailure) {
          throw new ScheduleError(
            `${NOT_ENOUGH_TIME_ALLOTTED_MESSAGE} No complete position-eligible assignment is available for the scheduled match.`,
            'NAMED_OFFICIAL_POSITION',
          );
        }
        if (sawTeamDutyCapacityFailure) {
          throw new ScheduleError(
            `${NOT_ENOUGH_TIME_ALLOTTED_MESSAGE} Not enough teams are available to cover match and team-official slots.`,
            'TEAM_DUTY',
          );
        }
        if (this.hasSlots) {
          throw new ScheduleError(
            `${NOT_ENOUGH_TIME_ALLOTTED_MESSAGE} No available time slots remaining for scheduling.`,
            'RESOURCE',
          );
        }
      }
      const candidateEnd = new Date(earliestStart.getTime() + durationMs);
      const participantAvailability = this.checkAvailabilityOfParticipants(
        earliestStart,
        candidateEnd,
        event,
      );
      if (participantAvailability === 'TEAM_DUTY') {
        sawTeamDutyCapacityFailure = true;
        (event as E & { placementRestriction?: 'TEAM_DUTY' }).placementRestriction = 'TEAM_DUTY';
      }
      const participantRetry = this.nextStartAfterKnownParticipantConflict(
        earliestStart,
        candidateEnd,
        event,
      );
      if (participantRetry) {
        earliestStart = participantRetry;
        continue;
      }
      if (participantAvailability === 'AVAILABLE') {
        const rawResource = this.findAvailableResource(earliestStart, durationMs, event);
        const resource = rawResource && opts?.canUseCandidate
          ? this.findAvailableResource(earliestStart, durationMs, event, opts.canUseCandidate)
          : rawResource;
        if (rawResource && opts?.canUseCandidate && !resource) {
          sawNamedOfficialCapacityFailure = true;
        }
        if (resource) {
          event.setResource(resource);
          event.start = earliestStart;
          event.end = candidateEnd;
          resource.addEvent(event);
          if ('placementState' in event) {
            event.placementState = 'PLACED';
          }
          return;
        }
        const resourceRetry = this.nextStartAfterResourceConflict(
          earliestStart,
          durationMs,
        );
        if (resourceRetry) {
          earliestStart = resourceRetry;
          continue;
        }
      }
      earliestStart = new Date(earliestStart.getTime() + MINUTE_MS);
    }
  }

  advanceTo(newTime: Date): void {
    if (newTime.getTime() <= this.currentTime.getTime()) return;
    this.currentTime = this.roundToNextMinute(newTime);
  }

  private getEarliestStartTime(event: E): Date {
    let earliest = this.startTime.getTime() > this.currentTime.getTime() ? this.startTime : this.currentTime;
    for (const dependency of event.getDependencies() as E[]) {
      const end = new Date(dependency.end.getTime() + dependency.bufferMs);
      if (end.getTime() > earliest.getTime()) {
        earliest = end;
      }
    }
    return this.roundToNextMinute(earliest);
  }

  private assertPossibleParticipantCapacity(event: E): void {
    const requiredTeamParticipants = event.getRequiredTeamParticipantCount?.() ?? 0;
    if (requiredTeamParticipants <= 0) {
      return;
    }
    const currentTeamIds = new Set<string>();
    for (const participant of this.participantPoolForCurrentGroups()) {
      if (participant instanceof Team) {
        currentTeamIds.add(participant.id);
      }
    }
    if (currentTeamIds.size < requiredTeamParticipants) {
      throw new ScheduleError(
        `${NOT_ENOUGH_TIME_ALLOTTED_MESSAGE} Not enough teams are available to cover match and team-official slots.`,
        (event as E & { reservesTeamOfficial?: boolean }).reservesTeamOfficial === true
          ? 'TEAM_DUTY'
          : 'PLAYING_TEAM',
      );
    }
  }

  private isAnonymousParticipant(participant: Participant): boolean {
    if (!(participant instanceof Team)) {
      return false;
    }
    return String(participant.kind ?? '').trim().toUpperCase() === 'PLACEHOLDER';
  }

  private nextStartAfterKnownParticipantConflict(
    start: Date,
    end: Date,
    event: E,
  ): Date | null {
    const candidateParticipantIds = new Set<string>();
    for (const participant of event.getParticipants()) {
      if (!this.isAnonymousParticipant(participant)) {
        candidateParticipantIds.add(participant.id);
      }
    }
    if (!candidateParticipantIds.size) {
      return null;
    }

    const startMs = start.getTime();
    const endMs = end.getTime();
    const candidateBufferMs = Math.max(0, event.bufferMs);
    let retryTimeMs: number | null = null;
    const visitedResources = new Set<R>();
    const visitedEvents = new Set<SchedulableEvent>();
    for (const resources of this.resources.values()) {
      for (const resource of resources) {
        if (visitedResources.has(resource)) {
          continue;
        }
        visitedResources.add(resource);
        for (const scheduledEvent of resource.getEvents()) {
          if (scheduledEvent === event || visitedEvents.has(scheduledEvent)) {
            continue;
          }
          visitedEvents.add(scheduledEvent);
          const scheduledBufferMs = Math.max(0, scheduledEvent.bufferMs);
          const conflictsWithRestWindow =
            startMs < scheduledEvent.end.getTime() + scheduledBufferMs &&
            endMs + candidateBufferMs > scheduledEvent.start.getTime();
          if (!conflictsWithRestWindow) {
            continue;
          }
          for (const participant of scheduledEvent.getParticipants()) {
            if (
              !this.isAnonymousParticipant(participant) &&
              candidateParticipantIds.has(participant.id)
            ) {
              const scheduledRetryTimeMs =
                scheduledEvent.end.getTime() + scheduledBufferMs;
              retryTimeMs =
                retryTimeMs === null
                  ? scheduledRetryTimeMs
                  : Math.min(retryTimeMs, scheduledRetryTimeMs);
              break;
            }
          }
        }
      }
    }
    return retryTimeMs === null ? null : new Date(retryTimeMs);
  }

  private checkAvailabilityOfParticipants(
    start: Date,
    end: Date,
    event: E,
  ): ParticipantAvailability {
    const participantPool = this.participantPoolForCurrentGroups();
    const currentParticipantIds = new Set<string>();
    for (const participant of participantPool) {
      currentParticipantIds.add(participant.id);
    }
    const minParticipants = event.getParticipants().length;
    if (!currentParticipantIds.size) {
      return minParticipants <= 0 ? 'AVAILABLE' : 'UNAVAILABLE';
    }

    const currentEvents = this.participantPoolEvents(start, end);
    const busyKnownParticipantIds = new Set<string>();
    let anonymousParticipantReservations = 0;
    for (const scheduledEvent of currentEvents) {
      const scheduledAnonymousParticipantIds = new Set<string>();
      for (const participant of scheduledEvent.getParticipants()) {
        if (this.isAnonymousParticipant(participant)) {
          scheduledAnonymousParticipantIds.add(participant.id);
        } else if (currentParticipantIds.has(participant.id)) {
          busyKnownParticipantIds.add(participant.id);
        }
      }
      anonymousParticipantReservations +=
        scheduledAnonymousParticipantIds.size;
    }

    const availableParticipants =
      currentParticipantIds.size -
      busyKnownParticipantIds.size -
      anonymousParticipantReservations;
    if (availableParticipants < minParticipants) {
      return 'UNAVAILABLE';
    }

    const requiredTeamParticipants =
      event.getRequiredTeamParticipantCount?.() ?? 0;
    if (requiredTeamParticipants <= 0) {
      return 'AVAILABLE';
    }

    const currentTeamIds = new Set<string>();
    for (const participant of participantPool) {
      if (participant instanceof Team) {
        currentTeamIds.add(participant.id);
      }
    }
    if (!currentTeamIds.size) {
      return 'UNAVAILABLE';
    }

    const busyKnownTeamIds = new Set<string>();
    let anonymousTeamReservations = 0;
    for (const scheduledEvent of currentEvents) {
      const scheduledKnownTeamIds = new Set<string>();
      for (const participant of scheduledEvent.getParticipants()) {
        if (
          participant instanceof Team &&
          !this.isAnonymousParticipant(participant) &&
          currentTeamIds.has(participant.id)
        ) {
          scheduledKnownTeamIds.add(participant.id);
          busyKnownTeamIds.add(participant.id);
        }
      }
      const scheduledRequiredTeams =
        scheduledEvent.getRequiredTeamParticipantCount?.() ??
        scheduledKnownTeamIds.size;
      anonymousTeamReservations += Math.max(
        0,
        scheduledRequiredTeams - scheduledKnownTeamIds.size,
      );
    }
    const reservedTeamSlots =
      busyKnownTeamIds.size + anonymousTeamReservations;
    const availableTeamSlots = currentTeamIds.size - reservedTeamSlots;

    if (availableTeamSlots >= requiredTeamParticipants) {
      return 'AVAILABLE';
    }
    return (event as E & { reservesTeamOfficial?: boolean }).reservesTeamOfficial === true
      ? 'TEAM_DUTY'
      : 'UNAVAILABLE';
  }

  private findAvailableResource(
    start: Date,
    durationMs: number,
    event: E | null,
    canUseCandidate?: (candidate: {
      event: E;
      resource: R;
      start: Date;
      end: Date;
    }) => boolean,
  ): R | null {
    let freeResource: R | null = null;
    const resources: R[] = [];
    for (const group of this.currentGroups) {
      resources.push(...this.resourcesForGroup(group));
    }
    resources.sort((a, b) => a.getEvents().length - b.getEvents().length);

    for (const resource of resources) {
      if (!this.resourceSupportsTime(resource, start, durationMs)) continue;
      const usingEvent = this.resourceEventAvailable(resource, start, durationMs);
      if (!usingEvent) {
        if (event && canUseCandidate) {
          const end = new Date(start.getTime() + durationMs);
          if (!canUseCandidate({ event, resource, start, end })) {
            continue;
          }
        }
        freeResource = resource;
        break;
      }
    }
    return freeResource;
  }

  private nextStartAfterResourceConflict(
    start: Date,
    durationMs: number,
  ): Date | null {
    const end = new Date(start.getTime() + durationMs);
    const visitedResources = new Set<R>();
    let retryTimeMs: number | null = null;
    for (const group of this.currentGroups) {
      for (const resource of this.resourcesForGroup(group)) {
        if (
          visitedResources.has(resource) ||
          !this.resourceSupportsTime(resource, start, durationMs)
        ) {
          continue;
        }
        visitedResources.add(resource);
        let resourceHasConflict = false;
        for (const scheduledEvent of resource.getEvents()) {
          if (!overlaps(scheduledEvent.start, scheduledEvent.end, start, end)) {
            continue;
          }
          resourceHasConflict = true;
          const scheduledEndMs = scheduledEvent.end.getTime();
          retryTimeMs =
            retryTimeMs === null
              ? scheduledEndMs
              : Math.min(retryTimeMs, scheduledEndMs);
        }
        if (!resourceHasConflict) {
          return null;
        }
      }
    }
    return retryTimeMs === null ? null : new Date(retryTimeMs);
  }

  currentEvents(start: Date, end: Date): SchedulableEvent[] {
    const events: SchedulableEvent[] = [];
    for (const group of this.currentGroups) {
      for (const resource of this.resourcesForGroup(group)) {
        for (const event of resource.getEvents()) {
          if (overlaps(event.start, event.end, start, end)) {
            events.push(event);
          }
        }
      }
    }
    return events;
  }

  private resourceEventAvailable(resource: R, start: Date, durationMs: number): E | null {
    const end = new Date(start.getTime() + durationMs);
    const resourceEvents = resource.getEvents() as E[];
    for (const event of resourceEvents) {
      if (overlaps(event.start, event.end, start, end)) {
        return resourceEvents[resourceEvents.length - 1] ?? event;
      }
    }
    return null;
  }

  private prepareTimeSlots(timeSlots: Iterable<any>): void {
    const reference = this.startTime;
    const repeatingSlots: any[] = [];

    for (const slot of timeSlots) {
      if (slot?.repeating === false) {
        const resolved = resolveOneTimeTimeSlot(slot, slot.timeZone);
        assertOneTimeTimeSlotWithinEventBounds(resolved, this.startTime, this.endTime);
        this.addSlotWindow(slot, resolved.start, resolved.end);
        continue;
      }
      repeatingSlots.push(slot);
    }

    let weeks = 0;
    while (reference.getTime() + weeks * 7 * 24 * 60 * MINUTE_MS <= this.endTime.getTime()) {
      const weekReference = new Date(reference.getTime() + weeks * 7 * 24 * 60 * MINUTE_MS);
      for (const slot of repeatingSlots) {
        for (const [slotStart, slotEnd] of this.slotRanges(slot, weekReference)) {
          this.addSlotWindow(slot, slotStart, slotEnd);
        }
      }
      weeks += 1;
    }
    for (const slots of this.resourceSlots.values()) {
      slots.sort((a, b) => a.start.getTime() - b.start.getTime());
    }
    this.globalSlots.sort((a, b) => a.start.getTime() - b.start.getTime());
  }

  private addSlotWindow(slot: any, slotStart: Date, slotEnd: Date): void {
    if (slotEnd.getTime() <= this.startTime.getTime() || slotStart.getTime() >= this.endTime.getTime()) {
      return;
    }
    const boundedStart = slotStart.getTime() < this.startTime.getTime() ? this.startTime : slotStart;
    const boundedEnd = slotEnd.getTime() > this.endTime.getTime() ? this.endTime : slotEnd;
    if (boundedEnd.getTime() <= boundedStart.getTime()) {
      return;
    }
    const fieldCandidates: unknown[] = Array.isArray(slot.scheduledFieldIds) && slot.scheduledFieldIds.length
      ? slot.scheduledFieldIds
      : Array.isArray(slot.fieldIds) && slot.fieldIds.length
        ? slot.fieldIds
        : [slot.field ?? slot.scheduledFieldId];
    const fieldIds: string[] = Array.from(
      new Set(
        fieldCandidates
          .map((value): string | null => {
            if (typeof value === 'string' && value.length > 0) {
              return value;
            }
            if (typeof value === 'number' && Number.isFinite(value)) {
              return String(value);
            }
            return null;
          })
          .filter((value): value is string => value !== null),
      ),
    );
    const groupIds = this.normalizeGroupIds(slot.divisions);
    const window: SlotWindow = {
      start: boundedStart,
      end: boundedEnd,
      groupIds: groupIds.size ? groupIds : null,
    };
    if (!fieldIds.length) {
      this.globalSlots.push(window);
      return;
    }
    for (const fieldId of fieldIds) {
      const existing = this.resourceSlots.get(fieldId) ?? [];
      existing.push(window);
      this.resourceSlots.set(fieldId, existing);
    }
  }

  private slotRanges(slot: any, reference: Date): Array<[Date, Date]> {
    const parseDate = (value: unknown): Date | null => {
      if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
      }
      if (typeof value === 'string' || typeof value === 'number') {
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
      }
      return null;
    };

    const timeZone = normalizeTimeZone(slot.timeZone, 'UTC');
    const referenceParts = getDateTimePartsInTimeZone(reference, timeZone);
    if (!referenceParts) {
      return [];
    }
    const normalizedDays: number[] = Array.from(
      new Set(
        (Array.isArray(slot.daysOfWeek) && slot.daysOfWeek.length
          ? slot.daysOfWeek
          : slot.dayOfWeek !== undefined
            ? [slot.dayOfWeek]
            : slot.day_of_week !== undefined
              ? [slot.day_of_week]
              : [0]
        )
          .map((value: unknown) => Number(value))
          .filter((value: number) => Number.isInteger(value) && value >= 0 && value <= 6),
      ),
    );
    const startMinutes = slot.startTimeMinutes ?? slot.start_time_minutes ?? 0;
    const endMinutes = slot.endTimeMinutes ?? slot.end_time_minutes ?? 0;
    const recurringStartDate = parseDate(slot.startDate);
    const recurringEndDate = parseDate(slot.endDate);
    const calendarDay = (value: Date | null): number | null => {
      if (!value) return null;
      const parts = getDateTimePartsInTimeZone(value, timeZone);
      return parts
        ? Date.UTC(parts.year, parts.month - 1, parts.day)
        : null;
    };
    const recurringStartDayMs = calendarDay(recurringStartDate);
    const recurringEndDayMs = calendarDay(recurringEndDate);
    const referenceNoon = new Date(
      Date.UTC(
        referenceParts.year,
        referenceParts.month - 1,
        referenceParts.day,
        12,
      ),
    );
    const referenceDay = (referenceNoon.getUTCDay() + 6) % 7;
    const toWallClock = (slotNoon: Date, minutes: number): Date | null => {
      const dayOffset = Math.floor(minutes / (24 * 60));
      const minuteOfDay = ((minutes % (24 * 60)) + (24 * 60)) % (24 * 60);
      const targetDay = new Date(
        slotNoon.getTime() + dayOffset * 24 * 60 * MINUTE_MS,
      );
      const hours = Math.floor(minuteOfDay / 60);
      const minute = minuteOfDay % 60;
      return zonedTimeToUtcDate(
        `${targetDay.getUTCFullYear()}-${pad2(targetDay.getUTCMonth() + 1)}-${pad2(targetDay.getUTCDate())}T${pad2(hours)}:${pad2(minute)}:00`,
        timeZone,
      );
    };

    const ranges: Array<[Date, Date]> = [];
    for (const dayOfWeek of normalizedDays) {
      const daysAhead = (dayOfWeek - referenceDay + 7) % 7;
      const slotNoon = new Date(
        referenceNoon.getTime() + daysAhead * 24 * 60 * MINUTE_MS,
      );
      const slotDayMs = Date.UTC(
        slotNoon.getUTCFullYear(),
        slotNoon.getUTCMonth(),
        slotNoon.getUTCDate(),
      );
      if (recurringStartDayMs !== null && slotDayMs < recurringStartDayMs) {
        continue;
      }
      if (recurringEndDayMs !== null && slotDayMs > recurringEndDayMs) {
        continue;
      }
      const start = toWallClock(slotNoon, startMinutes);
      const end = toWallClock(slotNoon, endMinutes);
      if (!start || !end || end.getTime() <= start.getTime()) {
        continue;
      }
      ranges.push([start, end]);
    }
    return ranges;
  }

  private nextValidStartTime(candidate: Date, durationMs: number): Date {
    if (!this.hasSlots) return candidate;
    const resources: R[] = [];
    for (const group of this.currentGroups) {
      resources.push(...this.resourcesForGroup(group));
    }
    if (!resources.length) {
      const groupIds = this.currentGroups
        .map((group) => (group as any)?.id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0);
      const suffix = groupIds.length ? ` for divisions: ${groupIds.join(', ')}` : '';
      // Include "no fields" so callers can treat this as a configuration error.
      throw new ScheduleError(`Unable to schedule event because no fields are available${suffix}.`, 'RESOURCE');
    }
    let hasCompatibleSlots = false;
    let earliestAvailableStart: Date | null = null;

    for (const resource of resources) {
      const slots = this.slotsForResource(resource);
      if (!slots.length) continue;
      hasCompatibleSlots = true;
      const slotStart = this.alignStartToSlots(slots, candidate, durationMs);
      if (!slotStart) continue;
      if (
        !earliestAvailableStart
        || slotStart.getTime() < earliestAvailableStart.getTime()
      ) {
        earliestAvailableStart = slotStart;
      }
    }
    if (earliestAvailableStart) return earliestAvailableStart;
    if (!hasCompatibleSlots) {
      throw new ScheduleError(
        `${NOT_ENOUGH_TIME_ALLOTTED_MESSAGE} No compatible time slots are available for the selected fields and divisions.`,
        'RESOURCE',
      );
    }
    throw new ScheduleError(
      `${NOT_ENOUGH_TIME_ALLOTTED_MESSAGE} No available time slots remaining for scheduling.`,
      'RESOURCE',
    );
  }

  private slotsForResource(resource: R): SlotWindow[] {
    const resourceId = resource.id;
    const specific = resourceId ? this.resourceSlots.get(resourceId) ?? [] : [];
    const combined = specific.length
      ? (this.globalSlots.length ? [...specific, ...this.globalSlots] : specific)
      : this.globalSlots;
    return this.filterSlotsByCurrentGroups(combined);
  }

  private alignStartToSlots(slots: SlotWindow[], candidate: Date, durationMs: number): Date | null {
    for (const slot of slots) {
      const start = slot.start;
      const end = slot.end;
      if (end.getTime() - start.getTime() < durationMs) continue;
      if (start.getTime() <= candidate.getTime() && end.getTime() >= candidate.getTime() + durationMs) {
        return candidate;
      }
      if (start.getTime() > candidate.getTime() && end.getTime() >= start.getTime() + durationMs) {
        return start;
      }
    }
    return null;
  }

  private resourceSupportsTime(resource: R, start: Date, durationMs: number): boolean {
    if (!this.hasSlots) return true;
    const slots = this.slotsForResource(resource);
    if (!slots.length) return false;
    const aligned = this.alignStartToSlots(slots, start, durationMs);
    return aligned?.getTime() === start.getTime();
  }

  private normalizeGroupIds(value: unknown): Set<string> {
    if (!Array.isArray(value)) return new Set();
    return new Set(
      value
        .map((entry) => {
          if (typeof entry === 'string') return entry;
          if (entry && typeof entry === 'object' && 'id' in entry && typeof (entry as any).id === 'string') {
            return (entry as any).id as string;
          }
          return '';
        })
        .map((entry) => entry.trim().toLowerCase())
        .filter((entry) => entry.length > 0),
    );
  }

  private filterSlotsByCurrentGroups(slots: SlotWindow[]): SlotWindow[] {
    if (!slots.length) return [];
    const currentGroupIds = new Set(
      this.currentGroups
        .map((group) => (group as any)?.id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
        .map((id) => id.trim().toLowerCase()),
    );
    if (!currentGroupIds.size) {
      return slots;
    }
    return slots
      .filter((slot) => {
        if (!slot.groupIds || !slot.groupIds.size) return true;
        for (const groupId of currentGroupIds) {
          if (slot.groupIds.has(groupId)) {
            return true;
          }
        }
        return false;
      })
      .sort((a, b) => a.start.getTime() - b.start.getTime());
  }

  private roundToNextMinute(date: Date): Date {
    if (date.getSeconds() === 0 && date.getMilliseconds() === 0) {
      return new Date(date);
    }
    const rounded = new Date(date);
    rounded.setSeconds(0, 0);
    rounded.setMinutes(rounded.getMinutes() + 1);
    return rounded;
  }
}

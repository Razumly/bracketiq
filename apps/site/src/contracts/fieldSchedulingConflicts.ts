export type FieldSchedulingConflictKind =
  | "MATCH"
  | "ONE_TIME_EVENT"
  | "EVENT_TIME_SLOT"
  | "RENTAL_BOOKING"
  | "OCCUPIED";

export type FieldSchedulingConflictVisibleKind = Exclude<
  FieldSchedulingConflictKind,
  "OCCUPIED"
>;

export type FieldSchedulingConflictSourceProjection = {
  id: string | null;
  eventId: string | null;
  parentId: string | null;
  kind: FieldSchedulingConflictVisibleKind;
  eventType: string | null;
  eventStart: string | null;
  eventEnd: string | null;
  eventTimeZone: string | null;
  noFixedEndDateTime: boolean;
  repeating: boolean;
  startDate: string | null;
  endDate: string | null;
  timeZone: string | null;
  startTimeMinutes: number | null;
  endTimeMinutes: number | null;
  daysOfWeek: number[];
  scheduledFieldIds: string[];
};

export type FieldSchedulingConflictVisibleResponse = {
  slotKey: string;
  fieldId: string;
  kind: FieldSchedulingConflictVisibleKind;
  start: string;
  end: string;
  source: FieldSchedulingConflictSourceProjection;
};

export type FieldSchedulingConflictOpaqueResponse = {
  slotKey: string;
  fieldId: string;
  kind: "OCCUPIED";
  start: string;
  end: string;
  source: null;
};

export type FieldSchedulingConflictResponse =
  | FieldSchedulingConflictVisibleResponse
  | FieldSchedulingConflictOpaqueResponse;

export type FieldSchedulingConflictBatchRequest = {
  eventId?: string | null;
  organizationId?: string | null;
  eventType?: string | null;
  parentEvent?: string | null;
  eventStart?: string | null;
  eventEnd?: string | null;
  hasNoFixedEventEnd?: boolean;
  slots: Array<{
    key: string;
    $id?: string;
    scheduledFieldId?: string;
    scheduledFieldIds?: string[];
    dayOfWeek?: number;
    daysOfWeek?: number[];
    startDate?: string;
    endDate?: string;
    timeZone?: string;
    startTimeMinutes?: number;
    endTimeMinutes?: number;
    repeating: boolean;
  }>;
};

export type FieldSchedulingConflictBatchResponse = {
  conflicts: FieldSchedulingConflictResponse[];
};

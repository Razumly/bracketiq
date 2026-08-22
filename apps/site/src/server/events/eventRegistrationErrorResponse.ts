import { NextResponse } from "next/server";

import {
  EventConfigurationChangedError,
  EventRegistrationCapacityError,
  EventRegistrationDivisionError,
  EventRegistrationStructureLockedError,
  EventRegistrationUnitError,
} from "@/server/events/eventRegistrations";

export const eventRegistrationErrorResponse = (
  error: unknown,
): NextResponse | null => {
  if (error instanceof EventConfigurationChangedError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }
  if (error instanceof EventRegistrationStructureLockedError) {
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
        field: error.fieldName,
      },
      { status: error.status },
    );
  }
  if (error instanceof EventRegistrationCapacityError) {
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
        capacity: error.capacity,
        participantCount: error.participantCount,
      },
      { status: error.status },
    );
  }
  if (error instanceof EventRegistrationDivisionError) {
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
        divisionId: error.divisionId,
        matchCount: error.matchCount,
      },
      { status: error.status },
    );
  }
  if (error instanceof EventRegistrationUnitError) {
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
        field: "teamSignup",
        details: {
          eventType: error.eventType,
          teamSignup: error.teamSignup,
        },
      },
      { status: error.status },
    );
  }
  return null;
};

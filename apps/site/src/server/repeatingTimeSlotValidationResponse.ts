import { NextResponse } from "next/server";

import { RepeatingTimeSlotValidationError } from "@/lib/repeatingTimeSlotAvailability";

export const repeatingTimeSlotValidationResponse = (
  error: unknown,
): NextResponse | null => {
  if (!(error instanceof RepeatingTimeSlotValidationError)) {
    return null;
  }
  return NextResponse.json(
    {
      error: error.message,
      code: "INVALID_TIME_SLOT",
      slotIds: [error.slotId],
      occurrenceDate: error.occurrenceDate,
    },
    { status: 400 },
  );
};

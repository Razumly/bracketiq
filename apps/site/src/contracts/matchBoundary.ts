import { z } from 'zod';

export const matchBoundaryErrorSchema = z.object({
  code: z.literal('MATCH_OUTSIDE_EVENT_BOUNDS'),
  error: z.string(),
  eventId: z.string(),
  eventStart: z.string().datetime(),
  eventEnd: z.string().datetime().nullable(),
  matchIds: z.array(z.string()),
});

export type MatchBoundaryError = z.infer<typeof matchBoundaryErrorSchema>;

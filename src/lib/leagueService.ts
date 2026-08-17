import { apiRequest } from '@/lib/apiClient';
import { Event, TimeSlot } from '@/types';

export interface WeeklySlotConflict {
  schedule: TimeSlot;
  event: Event;
}

export interface LeagueScheduleResponse {
  preview?: boolean;
  event?: Event;
  warnings?: Array<{
    code: string;
    message: string;
    matchIds?: string[];
  }>;
}
class LeagueService {
  async deleteMatchesByEvent(eventId: string): Promise<void> {
    await apiRequest(`/api/events/${eventId}/matches`, { method: 'DELETE' });
  }
}

export const leagueService = new LeagueService();

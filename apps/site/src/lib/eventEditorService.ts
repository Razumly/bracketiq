import { apiRequest } from "@/lib/apiClient";
import {
  EVENT_EDITOR_CONTRACT_VERSION,
  type EventEditorAcceptProposalCommand,
  type EventEditorCreateResult,
  type EventEditorProposalReference,
} from "@/contracts/eventEditor";

const proposalBody = (reference: EventEditorProposalReference) => ({
  contractVersion: EVENT_EDITOR_CONTRACT_VERSION,
  createOperationId: reference.createOperationId,
  proposalRevision: reference.proposalRevision,
});

export const eventEditorService = {
  acceptScheduleProposal: (
    command: EventEditorAcceptProposalCommand,
  ): Promise<EventEditorCreateResult> =>
    apiRequest<EventEditorCreateResult>("/api/events/editor", {
      method: "PUT",
      body: command,
    }),

  rejectScheduleProposal: async (
    reference: EventEditorProposalReference,
  ): Promise<void> => {
    await apiRequest("/api/events/editor", {
      method: "DELETE",
      body: proposalBody(reference),
    });
  },
};

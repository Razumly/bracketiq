import type { RefObject } from 'react';
import { Tabs, Center, Loader } from '@mantine/core';
import EventDetailSheet from '@/app/discover/components/EventDetailSheet';
import type { Event, Organization, UserData } from '@/types';
import EventForm, { type EventFormHandle } from '../components/EventForm';
import type { DefaultLocation, RentalPurchaseContext } from '../components/eventForm/types';
import type { EventEditorSnapshot, EventEditorDraft } from '@/contracts/eventEditor';
import type { WeeklyOccurrenceSelection } from './helpers';

type DetailsTabPanelProps = {
  shouldShowCreationSheet: boolean;
  user: UserData | null | undefined;
  eventFormRenderKey: string;
  eventFormRef: RefObject<EventFormHandle | null>;
  isActive: boolean;
  onClose: () => void;
  onDirtyStateChange: (hasChanges: boolean) => void;
  onValidityChange?: (isValid: boolean) => void;
  onDraftStateChange: (state: { draft: EventEditorDraft; baselineDraft: EventEditorDraft }) => void;
  onSubmitRequest?: () => void;
  event: Event;
  editorSnapshot: EventEditorSnapshot | null;
  organization: Organization | null;
  defaultLocation?: DefaultLocation;
  isCreateMode: boolean;
  rentalPurchase?: RentalPurchaseContext;
  templateOrganizationId?: string;
  selectedOccurrence: WeeklyOccurrenceSelection | null;
  onWeeklyOccurrenceChange: (occurrence: { slotId: string; occurrenceDate: string } | null) => void;
};

export default function DetailsTabPanel({
  shouldShowCreationSheet,
  user,
  eventFormRenderKey,
  eventFormRef,
  isActive,
  onClose,
  onDirtyStateChange,
  onValidityChange,
  onDraftStateChange,
  onSubmitRequest,
  event,
  editorSnapshot,
  organization,
  defaultLocation,
  isCreateMode,
  rentalPurchase,
  templateOrganizationId,
  selectedOccurrence,
  onWeeklyOccurrenceChange,
}: DetailsTabPanelProps) {
  return (
    <Tabs.Panel value="details" pt="md">
      {shouldShowCreationSheet && user ? (
        editorSnapshot ? (
          <EventForm
            key={eventFormRenderKey}
            ref={eventFormRef}
            isOpen={isActive}
            onClose={onClose}
            onDirtyStateChange={onDirtyStateChange}
            onDraftStateChange={onDraftStateChange}
            onValidityChange={onValidityChange}
            onSubmitRequest={onSubmitRequest}
            currentUser={user}
            snapshot={editorSnapshot}
            defaultLocation={defaultLocation}
            isCreateMode={isCreateMode}
            rentalPurchase={isCreateMode ? rentalPurchase : undefined}
            templateOrganizationId={isCreateMode ? templateOrganizationId : undefined}
          />
        ) : (
          <Center mih={240}><Loader /></Center>
        )
      ) : (
        <EventDetailSheet
          event={event}
          isOpen={isActive}
          renderInline
          selectedOccurrence={selectedOccurrence}
          onWeeklyOccurrenceChange={onWeeklyOccurrenceChange}
          onClose={onClose}
        />
      )}
    </Tabs.Panel>
  );
}

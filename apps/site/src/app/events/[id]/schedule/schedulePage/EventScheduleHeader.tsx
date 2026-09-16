import { Megaphone, QrCode } from 'lucide-react';

import { EventQrCodeModal, buildEventPublicUrl } from '@/components/events/EventQrCodeModal';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Select,
  Title,
} from '@/components/organization/organization-operation-ui';
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
} from '@/components/ui/menu';

import EventSchedulePendingChangesPopover from './EventSchedulePendingChangesPopover';
import {
  EVENT_LIFECYCLE_OPTIONS,
  type EventLifecycleStatus,
  type PendingSaveChangeItem,
} from './helpers';
import type { TemplateRentalResourcePrompt } from './useCreateEventFlow';

type EventScheduleHeaderProps = {
  eventId: string;
  eventName: string;
  organizationLogoId?: string | null;
  selectedOccurrenceLabel?: string | null;
  onClearSelectedOccurrence: () => void;
  showNotificationAction: boolean;
  onOpenNotification: () => void;
  showReportAction: boolean;
  reportingEvent: boolean;
  onReportEvent: () => void;
  showEditAction: boolean;
  onEnterEditMode: () => void;
  showQrCodeAction: boolean;
  qrCodeOpen: boolean;
  onOpenQrCode: () => void;
  onCloseQrCode: () => void;
  showEditingActions: boolean;
  pendingChangesOpen: boolean;
  pendingSaveChanges: PendingSaveChangeItem[];
  onPendingChangesOpenChange: (opened: boolean) => void;
  showDiscardChanges: boolean;
  onDiscardChanges: () => void;
  showLifecycleStatusSelect: boolean;
  selectedLifecycleStatus: EventLifecycleStatus | null;
  activeLifecycleStatus: EventLifecycleStatus;
  onLifecycleStatusChange: (value: string | null) => void;
  showSaveAction: boolean;
  createButtonLabel: string;
  isCreateMode: boolean;
  formIsValid: boolean;
  onSave: () => void;
  publishing: boolean;
  hasNetworkActionInFlight: boolean;
  hasPendingUnsavedChanges: boolean;
  hasSplitDivisionUnassignedTeams: boolean;
  showMoreActions: boolean;
  showBuildScheduleAction: boolean;
  isBuildScheduleActionInFlight: boolean;
  onBuildSchedule: () => void;
  showCompleteScheduleAction: boolean;
  isCompleteScheduleActionInFlight: boolean;
  onCompleteSchedule: () => void;
  showRebuildScheduleAction: boolean;
  isRebuildScheduleActionInFlight: boolean;
  onRebuildSchedule: () => void;
  showRebuildWithoutPlaceholdersAction: boolean;
  isRebuildWithoutPlaceholdersActionInFlight: boolean;
  onRebuildWithoutPlaceholders: () => void;
  showCancelAction: boolean;
  cancelling: boolean;
  cancelButtonLabel: string;
  onCancel: () => void;
  showDeleteTemplateAction: boolean;
  onDeleteTemplate: () => void;
  showDeleteEventAction: boolean;
  onDeleteEvent: () => void;
  showCreateTemplateAction: boolean;
  creatingTemplate: boolean;
  onCreateTemplate: () => void;
  infoMessage: string | null;
  onInfoMessageClose: () => void;
  submitError: string | null;
  onSubmitErrorClose: () => void;
  error: string | null;
  onErrorClose: () => void;
  visibleMatchConflictMessage: string | null;
  onMatchConflictMessageClose: () => void;
  warningMessage: string | null;
  onWarningMessageClose: () => void;
  templateRentalResourcePrompt: TemplateRentalResourcePrompt | null;
  onTemplateRentalResourcePromptClose: () => void;
  showSplitDivisionWarning: boolean;
  unassignedTeamLabels: string[];
  actionError: string | null;
  onActionErrorClose: () => void;
};

export default function EventScheduleHeader({
  eventId,
  eventName,
  organizationLogoId,
  selectedOccurrenceLabel,
  onClearSelectedOccurrence,
  showNotificationAction,
  onOpenNotification,
  showReportAction,
  reportingEvent,
  onReportEvent,
  showEditAction,
  onEnterEditMode,
  showQrCodeAction,
  qrCodeOpen,
  onOpenQrCode,
  onCloseQrCode,
  showEditingActions,
  pendingChangesOpen,
  pendingSaveChanges,
  onPendingChangesOpenChange,
  showDiscardChanges,
  onDiscardChanges,
  showLifecycleStatusSelect,
  selectedLifecycleStatus,
  activeLifecycleStatus,
  onLifecycleStatusChange,
  showSaveAction,
  createButtonLabel,
  isCreateMode,
  formIsValid,
  onSave,
  publishing,
  hasNetworkActionInFlight,
  hasPendingUnsavedChanges,
  hasSplitDivisionUnassignedTeams,
  showMoreActions,
  showBuildScheduleAction,
  isBuildScheduleActionInFlight,
  onBuildSchedule,
  showCompleteScheduleAction,
  isCompleteScheduleActionInFlight,
  onCompleteSchedule,
  showRebuildScheduleAction,
  isRebuildScheduleActionInFlight,
  onRebuildSchedule,
  showRebuildWithoutPlaceholdersAction,
  isRebuildWithoutPlaceholdersActionInFlight,
  onRebuildWithoutPlaceholders,
  showCancelAction,
  cancelling,
  cancelButtonLabel,
  onCancel,
  showDeleteTemplateAction,
  onDeleteTemplate,
  showDeleteEventAction,
  onDeleteEvent,
  showCreateTemplateAction,
  creatingTemplate,
  onCreateTemplate,
  infoMessage,
  onInfoMessageClose,
  submitError,
  onSubmitErrorClose,
  error,
  onErrorClose,
  visibleMatchConflictMessage,
  onMatchConflictMessageClose,
  warningMessage,
  onWarningMessageClose,
  templateRentalResourcePrompt,
  onTemplateRentalResourcePromptClose,
  showSplitDivisionWarning,
  unassignedTeamLabels,
  actionError,
  onActionErrorClose,
}: EventScheduleHeaderProps) {
  const showActions = showReportAction || showNotificationAction || showEditAction || showQrCodeAction || showEditingActions || showMoreActions;
  const showActionButtons = showReportAction || showEditAction || showQrCodeAction || showEditingActions || showMoreActions;

  return (
    <>
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-0">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <Title order={2} mb={0} className="min-w-0 max-w-full break-words">{eventName}</Title>
            {selectedOccurrenceLabel && (
              <Badge variant="light" color="red" className="gap-1">
                <span>{selectedOccurrenceLabel}</span>
                <ActionIcon
                  variant="subtle"
                  color="red"
                  size="xs"
                  aria-label="Clear selected session"
                  onClick={onClearSelectedOccurrence}
                >
                  <span aria-hidden="true">×</span>
                </ActionIcon>
              </Badge>
            )}
          </div>
        </div>

        {showActions && (
          <div className="flex w-full min-w-0 flex-wrap items-start justify-end gap-2 sm:ml-auto sm:w-auto sm:shrink-0">
            {showNotificationAction && (
              <ActionIcon
                variant="subtle"
                size="lg"
                onClick={onOpenNotification}
                aria-label="Send notification"
                title="Send notification"
              >
                <Megaphone size={18} />
              </ActionIcon>
            )}

            {showActionButtons && (
              <Group className="min-w-0 flex-1 sm:flex-initial" gap="sm" wrap="wrap" justify="flex-end">
                {showReportAction && (
                  <Button
                    variant="light"
                    color="red"
                    onClick={onReportEvent}
                    loading={reportingEvent}
                  >
                    Report Event
                  </Button>
                )}
                {showEditAction && (
                  <Button onClick={onEnterEditMode} disabled={hasNetworkActionInFlight}>
                    Manage
                  </Button>
                )}
                {showQrCodeAction && (
                  <Button
                    variant="default"
                    leftSection={<QrCode size={16} />}
                    onClick={onOpenQrCode}
                  >
                    QR Code
                  </Button>
                )}
                {showEditingActions && (
                  <>
                    <EventSchedulePendingChangesPopover
                      opened={pendingChangesOpen}
                      changes={pendingSaveChanges}
                      onOpenedChange={onPendingChangesOpenChange}
                    />
                    {showDiscardChanges && (
                      <Button
                        variant="default"
                        onClick={onDiscardChanges}
                        disabled={hasNetworkActionInFlight}
                      >
                        Discard Changes
                      </Button>
                    )}
                    {showLifecycleStatusSelect && (
                      <Select
                        aria-label="Event status"
                        readOnly
                        data={EVENT_LIFECYCLE_OPTIONS}
                        value={selectedLifecycleStatus ?? activeLifecycleStatus}
                        onChange={onLifecycleStatusChange}
                        allowDeselect={false}
                        w={160}
                        disabled={hasNetworkActionInFlight}
                      />
                    )}
                    {showSaveAction && (
                      <Button
                        color="green"
                        onClick={onSave}
                        loading={publishing}
                        disabled={
                          (hasNetworkActionInFlight && !publishing)
                          || (isCreateMode && !formIsValid)
                          || (!isCreateMode && !hasPendingUnsavedChanges)
                          || hasSplitDivisionUnassignedTeams
                        }
                      >
                        {isCreateMode ? createButtonLabel : 'Save'}
                      </Button>
                    )}
                  </>
                )}
                {showMoreActions && (
                  <Menu>
                    <MenuTrigger render={<Button variant="default">More</Button>} />
                    <MenuContent align="end" className="w-[17.5rem]">
                      {showBuildScheduleAction && (
                        <MenuItem
                          className="text-amber-700 focus:text-amber-800 dark:text-amber-300 dark:focus:text-amber-200"
                          onClick={onBuildSchedule}
                          disabled={
                            (hasNetworkActionInFlight && !isBuildScheduleActionInFlight)
                            || hasSplitDivisionUnassignedTeams
                          }
                        >
                          {isBuildScheduleActionInFlight ? 'Building...' : 'Build'}
                        </MenuItem>
                      )}
                      {showCompleteScheduleAction && (
                        <MenuItem
                          className="text-amber-700 focus:text-amber-800 dark:text-amber-300 dark:focus:text-amber-200"
                          onClick={onCompleteSchedule}
                          disabled={
                            (hasNetworkActionInFlight && !isCompleteScheduleActionInFlight)
                            || hasSplitDivisionUnassignedTeams
                          }
                        >
                          {isCompleteScheduleActionInFlight ? 'Completing...' : 'Complete'}
                        </MenuItem>
                      )}
                      {showRebuildScheduleAction && (
                        <MenuItem
                          className="text-amber-700 focus:text-amber-800 dark:text-amber-300 dark:focus:text-amber-200"
                          onClick={onRebuildSchedule}
                          disabled={
                            (hasNetworkActionInFlight && !isRebuildScheduleActionInFlight)
                            || hasSplitDivisionUnassignedTeams
                          }
                        >
                          {isRebuildScheduleActionInFlight ? 'Rebuilding...' : 'Rebuild'}
                        </MenuItem>
                      )}
                      {showRebuildWithoutPlaceholdersAction && (
                        <MenuItem
                          className="text-amber-700 focus:text-amber-800 dark:text-amber-300 dark:focus:text-amber-200"
                          onClick={onRebuildWithoutPlaceholders}
                          disabled={
                            (hasNetworkActionInFlight && !isRebuildWithoutPlaceholdersActionInFlight)
                            || hasSplitDivisionUnassignedTeams
                          }
                        >
                          {isRebuildWithoutPlaceholdersActionInFlight
                            ? 'Rebuilding without placeholders...'
                            : 'Rebuild without placeholders'}
                        </MenuItem>
                      )}
                      {showCancelAction && (
                        <MenuItem
                          variant="destructive"
                          onClick={onCancel}
                          disabled={hasNetworkActionInFlight && !cancelling}
                        >
                          {cancelling ? 'Cancelling...' : cancelButtonLabel}
                        </MenuItem>
                      )}
                      {showDeleteTemplateAction && (
                        <MenuItem
                          variant="destructive"
                          onClick={onDeleteTemplate}
                          disabled={hasNetworkActionInFlight && !cancelling}
                        >
                          {cancelling ? 'Deleting...' : 'Delete'}
                        </MenuItem>
                      )}
                      {showDeleteEventAction && (
                        <MenuItem
                          variant="destructive"
                          onClick={onDeleteEvent}
                          disabled={hasNetworkActionInFlight && !cancelling}
                        >
                          {cancelling ? 'Deleting...' : 'Delete Event'}
                        </MenuItem>
                      )}
                      {showCreateTemplateAction && (
                        <MenuItem
                          onClick={onCreateTemplate}
                          disabled={hasNetworkActionInFlight && !creatingTemplate}
                        >
                          {creatingTemplate ? 'Creating Template...' : 'Create Template'}
                        </MenuItem>
                      )}
                    </MenuContent>
                  </Menu>
                )}
              </Group>
            )}
          </div>
        )}
      </div>

      {showQrCodeAction && (
        <EventQrCodeModal
          eventId={eventId}
          eventName={eventName || 'Event'}
          eventUrl={buildEventPublicUrl(eventId)}
          organizationLogoId={organizationLogoId ?? null}
          opened={qrCodeOpen}
          onClose={onCloseQrCode}
        />
      )}

      {infoMessage && (
        <Alert color="green" radius="md" onClose={onInfoMessageClose} withCloseButton>
          {infoMessage}
        </Alert>
      )}

      {submitError && (
        <Alert color="red" radius="md" onClose={onSubmitErrorClose} withCloseButton>
          {submitError}
        </Alert>
      )}

      {error && (
        <Alert color="red" radius="md" onClose={onErrorClose} withCloseButton>
          {error}
        </Alert>
      )}

      {visibleMatchConflictMessage && (
        <Alert
          color="yellow"
          radius="md"
          withCloseButton
          onClose={onMatchConflictMessageClose}
        >
          {visibleMatchConflictMessage}
        </Alert>
      )}

      {warningMessage && (
        <Alert color="yellow" radius="md" onClose={onWarningMessageClose} withCloseButton>
          {warningMessage}
        </Alert>
      )}

      {templateRentalResourcePrompt && (
        <Alert color="blue" radius="md" onClose={onTemplateRentalResourcePromptClose} withCloseButton>
          <Group justify="space-between" align="center" gap="sm">
            <span>{templateRentalResourcePrompt.message}</span>
            {templateRentalResourcePrompt.href && (
              <Button
                component="a"
                href={templateRentalResourcePrompt.href}
                size="xs"
                variant="light"
              >
                Open Rentals
              </Button>
            )}
          </Group>
        </Alert>
      )}

      {showSplitDivisionWarning && (
        <Alert color="yellow" radius="md">
          Split-division leagues require every registered team to be assigned to a division before saving or rescheduling.
          Unassigned teams: {unassignedTeamLabels.join(', ')}.
        </Alert>
      )}

      {actionError && (
        <Alert color="red" radius="md" onClose={onActionErrorClose} withCloseButton>
          {actionError}
        </Alert>
      )}
    </>
  );
}

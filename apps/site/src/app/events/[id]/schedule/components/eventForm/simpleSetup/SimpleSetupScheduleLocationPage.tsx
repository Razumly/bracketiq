"use client";

import { NumberInput, Stack, Text, Title } from '@/components/organization/organization-operation-ui';

import { resolveEventResourceLabels } from "@/lib/sportResourceLabels";
import { isUnscheduledCompetition } from "../eventRules";
import { deriveScheduleParticipantCount } from "../divisionForm";
import { coordinatesAreSet } from "../locationHelpers";
import { EventDetailsLocationControls } from "../sections/EventDetailsLocationControls";
import { EventDetailsResourceControls } from "../sections/EventDetailsResourceControls";
import type { EventFormSectionsProps } from "../sections/EventFormSections";
import { EventDetailsTimingControls } from "../sections/EventDetailsTimingControls";
import { ScheduleConfigBody } from "../sections/ScheduleConfigBody";

const SHEET_POPOVER_Z_INDEX = 1800;
const sharedPopoverProps = {
  withinPortal: true,
  zIndex: SHEET_POPOVER_Z_INDEX,
};
const sharedComboboxProps = {
  withinPortal: true,
  zIndex: SHEET_POPOVER_Z_INDEX,
};
const alignedDetailsFieldStyles = {
  label: {
    minHeight: "3rem",
    display: "flex",
    alignItems: "flex-end",
    lineHeight: 1.25,
  },
} as const;
const MAX_STANDARD_NUMBER = 99_999;
const MAX_MEDIUM_TEXT_LENGTH = 160;

type SimpleSetupScheduleLocationPageProps = {
  model: EventFormSectionsProps;
};

export const SimpleSetupScheduleLocationPage = ({
  model,
}: SimpleSetupScheduleLocationPageProps) => {
  const {
    configurationActions,
    catalog,
    control,
    defaultCoordinates,
    divisionOptions,
    errors,
    eventData,
    fieldWriters,
    isImmutableField,
    resourceController,
    sectionsController,
    slotController,
    slotDivisionKeys,
  } = model;
  const {
    eventLocalFields,
    fieldCount,
    handleLocalFieldNameChange,
    hasExternalRentalField,
    hasImmutableTimeSlots,
    immutableTimeSlots,
    isOrganizationHostedEvent,
    isOrganizationManagedEvent,
    leagueFieldOptions,
    organizationHostedEventId,
    organizationResourcePool,
    rentalResourcesError,
    resourceSelectorLoading,
    selectedFields,
    setFieldCount,
    showLocalFieldCreationControls,
    showOrganizationFieldsInEventDetails,
    usesRentalSlots,
  } = resourceController;
  const {
    fieldNamesCollapsed,
    isSchedulableEventType,
    isWeeklyChildEvent,
    setFieldNamesCollapsed,
    showScheduleConfig,
  } = sectionsController;
  const {
    handleNoFixedEndDateTimeChange,
    handleSelectedAddressChange,
  } = configurationActions;
  const {
    handleAddSlot,
    handleAssignCalendarResource,
    handleAutoResolveSlotConflict,
    handleCreateCalendarSelection,
    handleMoveCalendarSlot,
    handleRemoveSlot,
    handleResizeCalendarSlot,
    handleUpdateSlot,
  } = slotController;
  const { setLeagueData } = fieldWriters;
  const { timingController } = model;
  const resourceLabels = resolveEventResourceLabels({
    sportIds: eventData.sportIds,
    sportsById: catalog.sportsById,
  });
  const localFieldCreationControl = showLocalFieldCreationControls ? (
    <NumberInput
      label={`${resourceLabels.singular} Count`}
      min={isOrganizationHostedEvent ? 0 : 1}
      max={12}
      value={fieldCount}
      w="100%"
      clampBehavior="blur"
      onChange={(value) => {
        const parsed =
          typeof value === "number" && Number.isFinite(value)
            ? value
            : Number(value);
        const minimum = isOrganizationHostedEvent ? 0 : 1;
        setFieldCount(
          Number.isFinite(parsed)
            ? Math.max(minimum, Math.trunc(parsed))
            : minimum,
        );
      }}
      error={errors.fieldCount?.message as string | undefined}
    />
  ) : null;
  const localResourceControls = showLocalFieldCreationControls ? (
    <EventDetailsResourceControls
      control={control}
      showOrganizationFields={showOrganizationFieldsInEventDetails}
      organizationResourcePool={organizationResourcePool}
      resourceSelectorLoading={resourceSelectorLoading}
      organizationHostedEventId={organizationHostedEventId}
      isImmutableField={isImmutableField}
      rentalResourcesError={rentalResourcesError}
      showLocalFieldCreationControls={showLocalFieldCreationControls}
      eventLocalFields={eventLocalFields}
      fieldNamesCollapsed={fieldNamesCollapsed}
      setFieldNamesCollapsed={setFieldNamesCollapsed}
      maxResourceNameLength={MAX_MEDIUM_TEXT_LENGTH}
      embedded
      resourceLabels={resourceLabels}
      showOrganizationResourceControls={false}
      localFieldCreationControl={localFieldCreationControl}
      onLocalFieldNameChange={handleLocalFieldNameChange}
    />
  ) : null;

  return (
    <Stack gap="lg">
      <div>
        <Title order={4}>Timing and location</Title>
        <Text size="sm" c="dimmed">
          Set the event window, address, and {resourceLabels.plural.toLocaleLowerCase()} available to the
          schedule.
        </Text>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-12 md:items-start">
        <div
          className={`min-w-0 ${
            localResourceControls
              ? "md:col-span-6"
              : "md:col-span-12"
          }`}
          data-testid="simple-setup-timing-location-column"
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:items-start">
            <EventDetailsTimingControls
              isImmutableField={isImmutableField}
              control={control}
              eventType={eventData.eventType}
              startValue={eventData.start}
              eventTimeZone={eventData.timeZone}
              noFixedEndDateTime={Boolean(eventData.noFixedEndDateTime)}
              supportsNoFixedEndDateTime={
                model.presentation.supportsNoFixedEndDateTime
              }
              automaticRefundsAvailable={
                model.paymentController.automaticRefundsAvailable
              }
              manualPaymentsEnabled={model.paymentController.manualPaymentsEnabled}
              todaysDate={new Date(new Date().setHours(0, 0, 0, 0))}
              maxStandardNumber={MAX_STANDARD_NUMBER}
              dateTimePickerStyles={alignedDetailsFieldStyles}
              numberInputStyles={alignedDetailsFieldStyles}
              fieldColumnClassName="md:col-span-1"
              onStartChange={timingController?.handleStartChange ?? configurationActions.handleStartChange}
              onEndChange={timingController?.handleEndChange ?? configurationActions.handleEndChange}
              startTimingSource={isSchedulableEventType ? timingController?.startSource : undefined}
              endTimingSource={isSchedulableEventType ? timingController?.endSource : undefined}
              onResetStartToCalendar={isSchedulableEventType ? timingController?.resetStartToCalendar : undefined}
              onResetEndToCalendar={isSchedulableEventType ? timingController?.resetEndToCalendar : undefined}
              scheduleBoundaryError={isSchedulableEventType ? timingController?.scheduleBoundaryError : undefined}
              scheduleBoundaryWarning={isSchedulableEventType ? timingController?.scheduleBoundaryWarning : undefined}
              onNoFixedEndDateTimeChange={timingController?.handleNoFixedEndDateTimeChange ?? handleNoFixedEndDateTimeChange}
              showAutomatedSchedulingControl={false}
              showScheduleControls
              showRegistrationControls={false}
              showGeneratedEndDateControl={isSchedulableEventType}
            />
          </div>
          <div className="mt-6">
            <EventDetailsLocationControls
              control={control}
              eventType={eventData.eventType}
              coordinates={eventData.coordinates}
              defaultCoordinates={defaultCoordinates}
              coordinatesSelected={coordinatesAreSet(eventData.coordinates)}
              onSelectedAddressChange={handleSelectedAddressChange}
              isLocationImmutable={
                isImmutableField("location") ||
                isImmutableField("coordinates") ||
                hasExternalRentalField
              }
              isImmutableField={isImmutableField}
              templatesLoading={false}
              templateOptions={[]}
              comboboxProps={sharedComboboxProps}
              maxStandardNumber={MAX_STANDARD_NUMBER}
              normalizeNumberValue={() => undefined}
              showRequiredDocumentControls={false}
              showAffiliateListingControls={false}
              showAgeControls={false}
              showRegistrationQuestions={false}
              showCapacityWarning={false}
              locationMapColumnClassName={localResourceControls ? "md:col-span-12" : undefined}
              resourceControls={
                showOrganizationFieldsInEventDetails ? (
                  <EventDetailsResourceControls
                    control={control}
                    showOrganizationFields={showOrganizationFieldsInEventDetails}
                    organizationResourcePool={organizationResourcePool}
                    resourceSelectorLoading={resourceSelectorLoading}
                    organizationHostedEventId={organizationHostedEventId}
                    isImmutableField={isImmutableField}
                    rentalResourcesError={rentalResourcesError}
                    showLocalFieldCreationControls={showLocalFieldCreationControls}
                    eventLocalFields={eventLocalFields}
                    fieldNamesCollapsed={fieldNamesCollapsed}
                    setFieldNamesCollapsed={setFieldNamesCollapsed}
                    maxResourceNameLength={MAX_MEDIUM_TEXT_LENGTH}
                    resourceLabels={resourceLabels}
                    embedded
                    showLocalFieldNameControls={false}
                    onLocalFieldNameChange={handleLocalFieldNameChange}
                  />
                ) : null
              }
              registrationQuestionsEditor={null}
              hasUnsetTeamCapacityLimits={false}
              teamSignup={Boolean(eventData.teamSignup)}
            />
          </div>
        </div>
        {localResourceControls ? (
          <div className="min-w-0 md:col-span-6">{localResourceControls}</div>
        ) : null}
        {showScheduleConfig ? (
          <div className="min-w-0 md:col-span-12">
          <Title order={4}>Schedule</Title>
          <Text size="sm" c="dimmed" mb="md">
            Configure availability from the Resource calendar and the Time Slot editor.
          </Text>
          <ScheduleConfigBody
            control={control}
            usesRentalSlots={usesRentalSlots}
            immutableTimeSlotCount={immutableTimeSlots.length}
            isWeeklyChildEvent={isWeeklyChildEvent}
            requiresWeeklyRepeatingSlot={
              eventData.eventType === "WEEKLY_EVENT" && !eventData.parentEvent
            }
            isSchedulableEventType={isSchedulableEventType}
            eventType={eventData.eventType}
            isOrganizationManagedEvent={isOrganizationManagedEvent}
            organizationHostedEventId={organizationHostedEventId}
            selectedFields={selectedFields}
            resourceSelectorLoading={resourceSelectorLoading}
            rentalResourcesError={rentalResourcesError}
            isImmutableField={isImmutableField}
            leagueData={eventData.leagueData}
            sport={eventData.sportConfig ?? undefined}
            participantCount={deriveScheduleParticipantCount({
              singleDivision: eventData.singleDivision,
              maxParticipants: eventData.maxParticipants,
              divisionDetails: eventData.divisionDetails,
            })}
            resourceLabels={resourceLabels}
            leagueSlots={eventData.leagueSlots}
            leagueFieldOptions={leagueFieldOptions}
            divisionOptions={divisionOptions}
            eventStartDate={eventData.start}
            eventEndDate={eventData.end}
            showBoundaryOnlyRange={isUnscheduledCompetition(
              eventData.eventType,
              eventData.isAutomatedScheduling,
            )}
            eventTimeZone={eventData.timeZone}
            timeslotMode="MIXED"
            showTimeslotHeading={false}
            lockSlotDivisions={Boolean(eventData.singleDivision)}
            lockedDivisionKeys={slotDivisionKeys}
            readOnly={hasImmutableTimeSlots}
            allowDivisionEditsWhenReadOnly={
              hasExternalRentalField && !eventData.singleDivision
            }
            allowResourceEditsWhenReadOnly={hasExternalRentalField}
            onLeagueDataChange={(updates) =>
              setLeagueData((previous) => ({
                ...previous,
                ...updates,
              }))
            }
            onAddSlot={handleAddSlot}
            onUpdateSlot={handleUpdateSlot}
            onRemoveSlot={handleRemoveSlot}
            onAutoResolveSlotConflict={handleAutoResolveSlotConflict}
            onCreateCalendarSelection={(selection) => {
              if (timingController && isUnscheduledCompetition(
                eventData.eventType,
                eventData.isAutomatedScheduling,
              )) {
                timingController.handleStartChange(selection.start);
                timingController.handleEndChange(selection.end);
              }
              handleCreateCalendarSelection(selection);
            }}
            onMoveCalendarSlot={slotController.handleMoveCalendarSlot}
            onResizeCalendarSlot={slotController.handleResizeCalendarSlot}
            onSelectCalendarSlot={(slotIndex) => {
              const slot = eventData.leagueSlots[slotIndex];
              if (!slot || typeof document === "undefined") {
                return;
              }
              const escapedKey =
                typeof CSS !== "undefined" && typeof CSS.escape === "function"
                  ? CSS.escape(slot.key)
                  : slot.key.replace(/"/g, '\\"');
              document
                .querySelector(`[data-event-slot-key="${escapedKey}"]`)
                ?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
            onAssignCalendarResource={handleAssignCalendarResource}
          />
        </div>
      ) : null}
      </div>
    </Stack>
  );
};

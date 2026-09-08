import {
  Alert,
  Button,
  Group,
  Modal,
  Stack,
  Text,
} from "@/components/organization/organization-operation-ui";
import type { RentalSelectionCheckoutPayload } from "@/app/organizations/[id]/FieldsTabContent";
import { formatPrice } from "@/types";

function RentalSelectionSummary({
  selection,
}: {
  selection: RentalSelectionCheckoutPayload;
}) {
  const location = selection.location || selection.facilityLocation;
  return (
    <Stack gap={4}>
      <Group justify="space-between">
        <Text fw={600}>Rental total</Text>
        <Text fw={700}>{formatPrice(selection.totalRentalCents)}</Text>
      </Group>
      {selection.facilityName && (
        <Text size="sm">
          <Text span fw={600}>
            Facility:
          </Text>{" "}
          {selection.facilityName}
        </Text>
      )}
      {selection.primaryFieldName && (
        <Text size="sm">
          <Text span fw={600}>
            Resource:
          </Text>{" "}
          {selection.primaryFieldName}
          {selection.fieldIds.length > 1
            ? ` + ${selection.fieldIds.length - 1} more`
            : ""}
        </Text>
      )}
      {location && (
        <Text size="sm" c="dimmed">
          {location}
        </Text>
      )}
    </Stack>
  );
}

type RentalReservationChoiceProps = {
  opened: boolean;
  selection: RentalSelectionCheckoutPayload | null;
  startingCheckout: boolean;
  onClose: () => void;
  onContinue: () => void;
};

export function RentalReservationChoice({
  opened,
  selection,
  startingCheckout,
  onClose,
  onContinue,
}: RentalReservationChoiceProps) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Reserve resources"
      centered
      size="lg"
    >
      <Stack gap="md">
        {selection && <RentalSelectionSummary selection={selection} />}
        <Text>
          Continue to complete any required documents and payment. After
          checkout, these resources are reserved and can be attached to an
          event.
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={startingCheckout} onClick={onContinue}>
            Continue to checkout
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

type RentalOrderNoticeProps = {
  message: string | null;
  canCreateEvent: boolean;
  onCreateEvent: () => void;
  onDismiss: () => void;
};

export function RentalOrderNotice({
  message,
  canCreateEvent,
  onCreateEvent,
  onDismiss,
}: RentalOrderNoticeProps) {
  if (!message) return null;
  return (
    <Alert color="green" title="Resources reserved">
      <Stack gap="sm">
        <Text size="sm">{message}</Text>
        {canCreateEvent && (
          <Group gap="sm">
            <Button size="sm" onClick={onCreateEvent}>
              Create event now
            </Button>
            <Button size="sm" variant="default" onClick={onDismiss}>
              Attach to event later
            </Button>
          </Group>
        )}
      </Stack>
    </Alert>
  );
}

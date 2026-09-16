"use client";
import type { ReactNode } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
} from "@/components/organization/organization-operation-ui";
import { Archive, ExternalLink, Pencil, Plus } from "lucide-react";
import type { Division } from "@/types";
import { normalizeExternalHttpUrl } from "@/lib/externalUrl";
import { OrganizationTableBody } from "@/components/organization/OrganizationDataLoading";
import {
  changeDivisionSport,
  divisionLabels,
  type DivisionDraft,
  type DivisionSport,
  type DivisionTypePayload,
  type divisionOptions,
} from "./organizationDivisionModel";

const formatPrice = (price?: number): string => {
  if (typeof price !== "number") return "Not specified";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(price / 100);
};

type DivisionRowProps = {
  division: Division;
  sports: DivisionSport[];
  types: DivisionTypePayload;
  canManage: boolean;
  editable: boolean;
  loading: boolean;
  openEdit: (division: Division) => void;
  archive: (division: Division) => Promise<void>;
};

function RegistrationRow({
  registrationUrl,
  division,
  children,
}: {
  registrationUrl: string | null;
  division: Division;
  children: ReactNode;
}) {
  const openRegistration = () => {
    if (registrationUrl)
      window.open(registrationUrl, "_blank", "noopener,noreferrer");
  };
  return (
    <Table.Tr
      onClick={registrationUrl ? openRegistration : undefined}
      onKeyDown={
        registrationUrl
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openRegistration();
              }
            }
          : undefined
      }
      role={registrationUrl ? "link" : undefined}
      tabIndex={registrationUrl ? 0 : undefined}
      aria-label={registrationUrl ? `Register for ${division.name}` : undefined}
      style={registrationUrl ? { cursor: "pointer" } : undefined}
    >
      {children}
    </Table.Tr>
  );
}

function DivisionRow({
  division,
  sports,
  types,
  canManage,
  editable,
  openEdit,
  archive,
  loading,
}: DivisionRowProps) {
  const { labels, error } = divisionLabels(division, sports, types);
  if (!labels)
    return (
      <Table.Tr>
        <Table.Td colSpan={editable ? 7 : 6}>
          <Text role="alert" c="red">
            {error}
          </Text>
        </Table.Td>
      </Table.Tr>
    );
  const registrationUrl = canManage
    ? null
    : normalizeExternalHttpUrl(division.registrationUrl);
  return (
    <RegistrationRow division={division} registrationUrl={registrationUrl}>
      <Table.Td>
        <Text fw={600} size="sm">
          {division.name}
        </Text>
        {division.status !== "ACTIVE" && (
          <Badge size="xs" color="gray">
            {division.status}
          </Badge>
        )}
        {registrationUrl && (
          <Group gap={4} mt={2} c="blue">
            <Text size="xs" c="blue">
              Register
            </Text>
            <ExternalLink size={12} aria-hidden="true" />
          </Group>
        )}
      </Table.Td>
      <Table.Td>{labels.sport}</Table.Td>
      <Table.Td>{labels.gender}</Table.Td>
      <Table.Td>{labels.age}</Table.Td>
      <Table.Td>{labels.skill}</Table.Td>
      <Table.Td>{formatPrice(division.price)}</Table.Td>
      {editable && (
        <Table.Td>
          <Group gap="xs" justify="flex-end" wrap="nowrap">
            <Tooltip label="Edit division">
              <ActionIcon
                variant="subtle"
                onClick={() => openEdit(division)}
                aria-label={`Edit ${division.name}`}
              >
                <Pencil size={16} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Archive division">
              <ActionIcon
                color="red"
                variant="subtle"
                loading={loading}
                onClick={() => void archive(division)}
                aria-label={`Archive ${division.name}`}
              >
                <Archive size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Table.Td>
      )}
    </RegistrationRow>
  );
}

export function DivisionHeading({
  summary,
  visibleCount,
  expanded,
  onToggle,
  canManage,
  openCreate,
  unavailable,
}: {
  summary: boolean;
  visibleCount: number;
  expanded: boolean;
  onToggle: () => void;
  canManage: boolean;
  openCreate: () => void;
  unavailable: boolean;
}) {
  return (
    <Group justify="space-between" mb="md">
      <div>
        <Title order={5}>
          {summary ? "Divisions Offered" : "Club Divisions"}
        </Title>
        {!summary && (
          <Text size="sm" c="dimmed">
            Current club offerings and total per-player season prices.
          </Text>
        )}
      </div>
      <Group gap="xs">
        {summary && visibleCount > 2 && (
          <Button variant="subtle" size="xs" onClick={onToggle}>
            {expanded ? "Show less" : `More (${visibleCount - 2})`}
          </Button>
        )}
        {canManage && !summary && (
          <Button
            leftSection={<Plus size={16} />}
            size="sm"
            onClick={openCreate}
            disabled={unavailable}
          >
            Add division
          </Button>
        )}
      </Group>
    </Group>
  );
}

type DivisionTableProps = Omit<DivisionRowProps, "division" | "editable"> & {
  summary: boolean;
  rows: Division[];
  isDataLoading: boolean;
  error: string | null;
};
export function DivisionTable({
  rows,
  canManage,
  summary,
  isDataLoading,
  error,
  sports,
  types,
  openEdit,
  archive,
  loading,
}: DivisionTableProps) {
  return (
    <>
      {!isDataLoading && !error && rows.length === 0 ? (
        <Text size="sm" c="dimmed">
          No club divisions have been added.
        </Text>
      ) : (
        <Table.ScrollContainer minWidth={720}>
          <Table verticalSpacing="sm" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Division</Table.Th>
                <Table.Th>Sport</Table.Th>
                <Table.Th>Gender</Table.Th>
                <Table.Th>Age</Table.Th>
                <Table.Th>Skill</Table.Th>
                <Table.Th>Season price</Table.Th>
                {canManage && !summary && <Table.Th aria-label="Actions" />}
              </Table.Tr>
            </Table.Thead>
            <OrganizationTableBody
              loading={isDataLoading}
              unavailable={Boolean(error)}
              columns={canManage && !summary ? 7 : 6}
              label="divisions"
            >
              {rows.map((division) => (
                <DivisionRow
                  key={division.id}
                  division={division}
                  canManage={canManage}
                  editable={canManage && !summary}
                  sports={sports}
                  types={types}
                  openEdit={openEdit}
                  archive={archive}
                  loading={loading}
                />
              ))}
            </OrganizationTableBody>
          </Table>
        </Table.ScrollContainer>
      )}
    </>
  );
}

export function DivisionEditor({
  opened,
  editingId,
  saving,
  draft,
  types,
  options,
  onChange,
  onClose,
  onSave,
  error,
}: {
  error: string | null;
  opened: boolean;
  editingId: string | null;
  saving: boolean;
  draft: DivisionDraft;
  types: DivisionTypePayload;
  options: ReturnType<typeof divisionOptions>;
  onChange: (draft: DivisionDraft) => void;
  onClose: () => void;
  onSave: () => Promise<void>;
}) {
  const {
    sports: sportOptions,
    genders: genderOptions,
    ages: ageOptions,
    skills: skillOptions,
  } = options;
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={editingId ? "Edit club division" : "Add club division"}
      centered
    >
      <fieldset disabled={saving} className="min-w-0">
        <Stack gap="sm">
          {error && <Alert color="red">{error}</Alert>}
          <Select
            label="Sport"
            data={sportOptions}
            value={draft.sportId}
            onChange={(value) =>
              onChange(changeDivisionSport(draft, types, value ?? ""))
            }
            required
            searchable
          />
          <Group grow align="flex-start">
            <Select
              label="Gender"
              data={genderOptions}
              value={draft.gender}
              onChange={(value) =>
                onChange({
                  ...draft,
                  gender: value === "M" || value === "F" ? value : "C",
                })
              }
              required
            />
            <Select
              label="Age"
              data={ageOptions}
              value={draft.ageDivisionTypeId}
              onChange={(value) =>
                onChange({ ...draft, ageDivisionTypeId: value ?? "" })
              }
              required
              searchable
            />
          </Group>
          <Select
            label="Filter skill level"
            description="Choose a standard skill level used by Discover filters."
            data={skillOptions}
            value={draft.skillDivisionTypeId}
            onChange={(value) =>
              onChange({ ...draft, skillDivisionTypeId: value ?? "" })
            }
            required
            searchable
          />
          <TextInput
            label="Division name"
            description="Use the club's custom division or team name, or leave blank to generate one."
            value={draft.name}
            onChange={(event) =>
              onChange({ ...draft, name: event.currentTarget.value })
            }
          />
          <Group grow align="flex-start">
            <NumberInput
              label="Division season price"
              description="Total per-player price for the club season."
              prefix="$"
              decimalScale={2}
              min={0}
              value={draft.priceDollars}
              onChange={(value) =>
                onChange({ ...draft, priceDollars: Number(value) || 0 })
              }
            />
            <NumberInput
              label="Capacity"
              description="Optional"
              min={1}
              value={draft.maxParticipants ?? ""}
              onChange={(value) =>
                onChange({
                  ...draft,
                  maxParticipants: value === "" ? null : Number(value),
                })
              }
            />
          </Group>
          <Textarea
            label="Description"
            autosize
            minRows={3}
            value={draft.description}
            onChange={(event) =>
              onChange({ ...draft, description: event.currentTarget.value })
            }
          />
          <TextInput
            label="Registration URL"
            type="url"
            value={draft.registrationUrl}
            onChange={(event) =>
              onChange({ ...draft, registrationUrl: event.currentTarget.value })
            }
          />
          {editingId && (
            <Select
              label="Status"
              data={[
                { value: "ACTIVE", label: "Active" },
                { value: "INACTIVE", label: "Inactive" },
              ]}
              value={draft.status}
              onChange={(value) =>
                onChange({
                  ...draft,
                  status: value === "INACTIVE" ? "INACTIVE" : "ACTIVE",
                })
              }
            />
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button loading={saving} onClick={() => void onSave()}>
              Save
            </Button>
          </Group>
        </Stack>
      </fieldset>
    </Modal>
  );
}

"use client";

import {
  Alert,
  Button,
  Checkbox,
  MultiSelect,
  NumberInput,
  Select,
  SimpleGrid,
  Text,
  TextInput,
} from "@/components/organization/organization-operation-ui";
import { SPORTS_LIST, type TeamJoinPolicy } from "@/types";
import { getDivisionTypeOptionsForSport } from "@/lib/divisionTypes";
import {
  effectiveTeamJoinPolicy,
  requiresTeamDivision,
  teamDivisionPreview,
  teamSizeError,
  type CreateTeamDraft,
} from "./createTeamDraft";
import type { useTeamDocumentOptions } from "./useTeamDocumentOptions";

type DraftFieldsProps = {
  draft: CreateTeamDraft;
  onChange: (patch: Partial<CreateTeamDraft>) => void;
};

const JOIN_OPTIONS = [
  { value: "CLOSED", label: "Closed" },
  { value: "OPEN_REGISTRATION", label: "Open registration" },
  { value: "REQUEST_TO_JOIN", label: "Request to join" },
];
const JOIN_DESCRIPTIONS: Record<TeamJoinPolicy, string> = {
  CLOSED: "Players need an invite to join this team.",
  OPEN_REGISTRATION: "Players can join this team without an invite.",
  REQUEST_TO_JOIN:
    "Players submit a request first. Managers approve before any bill is sent.",
};

export function TeamIdentityFields({ draft, onChange }: DraftFieldsProps) {
  const sports = Array.from(
    new Set([...SPORTS_LIST, draft.sport].filter(Boolean)),
  );
  return (
    <>
      <TextInput
        label="Team Name"
        placeholder="Enter team name"
        value={draft.name}
        onChange={(event) => onChange({ name: event.currentTarget.value })}
        required
        maxLength={50}
      />
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
        <NumberInput
          label="Team Size"
          min={0}
          step={1}
          value={draft.teamSize}
          onChange={(teamSize) => onChange({ teamSize })}
          error={teamSizeError(draft.teamSize)}
        />
        <Select
          label="Sport"
          data={sports}
          value={draft.sport || null}
          onChange={(sport) => onChange({ sport: sport || "" })}
          searchable
          clearable
        />
      </SimpleGrid>
    </>
  );
}

function registrationDescription(policy: TeamJoinPolicy, canCharge: boolean) {
  if (policy === "REQUEST_TO_JOIN")
    return "Shown as an expected cost and default bill amount. Players are not prompted to pay when requesting.";
  return canCharge
    ? "Leave at $0 for free registration."
    : "Connect Stripe to charge for open registration. Free registration is still available.";
}

export function TeamRegistrationFields({
  draft,
  onChange,
  canCharge,
}: DraftFieldsProps & { canCharge: boolean }) {
  const policy = effectiveTeamJoinPolicy(draft);
  return (
    <>
      <Select
        label="Join mode"
        data={JOIN_OPTIONS}
        value={policy}
        allowDeselect={false}
        onChange={(value) =>
          onChange({ joinPolicy: (value || "CLOSED") as TeamJoinPolicy })
        }
        disabled={draft.isAffiliateRegistration}
      />
      <Text size="xs" c="dimmed">
        {JOIN_DESCRIPTIONS[policy]}
      </Text>
      {requiresTeamDivision(draft) && (
        <NumberInput
          label="Registration price"
          description={registrationDescription(policy, canCharge)}
          min={0}
          step={0.01}
          prefix="$"
          value={draft.registrationPriceDollars}
          onChange={(value) => onChange({ registrationPriceDollars: value })}
          disabled={policy === "OPEN_REGISTRATION" && !canCharge}
        />
      )}
      {requiresTeamDivision(draft) && draft.sport.trim() && (
        <TeamDivisionFields draft={draft} onChange={onChange} />
      )}
    </>
  );
}

function TeamDivisionFields({ draft, onChange }: DraftFieldsProps) {
  const options = getDivisionTypeOptionsForSport(draft.sport);
  const skillOptions = options
    .filter((option) => option.ratingType === "SKILL")
    .map((option) => ({ value: option.id, label: option.name }));
  const ageOptions = options
    .filter((option) => option.ratingType === "AGE")
    .map((option) => ({ value: option.id, label: option.name }));
  return (
    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
      <Select
        label="Gender"
        data={[
          { value: "M", label: "Men's" },
          { value: "F", label: "Women's" },
          { value: "C", label: "Coed" },
        ]}
        value={draft.divisionGender || null}
        onChange={(value) =>
          onChange({
            divisionGender: (value || "") as CreateTeamDraft["divisionGender"],
          })
        }
        clearable
      />
      <Select
        label="Skill Division"
        data={skillOptions}
        value={draft.skillDivisionTypeId || null}
        onChange={(value) => onChange({ skillDivisionTypeId: value || "" })}
        searchable
        clearable
      />
      <Select
        label="Age Division"
        data={ageOptions}
        value={draft.ageDivisionTypeId || null}
        onChange={(value) => onChange({ ageDivisionTypeId: value || "" })}
        searchable
        clearable
      />
      <TextInput
        label="Division Preview"
        value={teamDivisionPreview(draft)}
        readOnly
      />
    </SimpleGrid>
  );
}

export function TeamMembershipFields({ draft, onChange }: DraftFieldsProps) {
  return (
    <>
      <Checkbox
        label="Add me as a player"
        description="If enabled, you will also be set as team captain. You will always be set as team manager."
        checked={draft.addSelfAsPlayer}
        onChange={(event) =>
          onChange({ addSelfAsPlayer: event.currentTarget.checked })
        }
      />
      <Checkbox
        label="External team registration"
        description="Players will register through the linked site instead of BracketIQ."
        checked={draft.isAffiliateRegistration}
        onChange={(event) =>
          onChange({ isAffiliateRegistration: event.currentTarget.checked })
        }
      />
      {draft.isAffiliateRegistration && (
        <TextInput
          label="Affiliate registration link"
          value={draft.affiliateUrl}
          onChange={(event) =>
            onChange({ affiliateUrl: event.currentTarget.value })
          }
          placeholder="https://example.com/team-registration"
          required
        />
      )}
    </>
  );
}

export function TeamDocumentFields({
  draft,
  onChange,
  templates,
}: DraftFieldsProps & {
  templates: ReturnType<typeof useTeamDocumentOptions>;
}) {
  const loaded = templates.status === "ready";
  return (
    <div className="space-y-2">
      <fieldset
        disabled={!loaded}
        className="m-0 min-w-0 border-0 p-0"
        aria-busy={templates.status === "loading"}
      >
        <MultiSelect
          label="Required Documents"
          data={templates.options}
          value={draft.requiredTemplateIds}
          onChange={(requiredTemplateIds) => onChange({ requiredTemplateIds })}
          placeholder="Select templates"
          searchable
          disabled={!loaded}
        />
      </fieldset>
      {templates.status === "loading" && (
        <p role="status" className="text-muted-foreground text-sm">
          Loading templates...
        </p>
      )}
      {templates.status === "error" && (
        <Alert color="red">
          <p>
            We could not load document templates. Try again before creating the
            team.
          </p>
          <Button variant="default" onClick={templates.retry}>
            Retry templates
          </Button>
        </Alert>
      )}
      {loaded && templates.options.length === 0 && (
        <Text size="xs" c="dimmed">
          No templates available for this organization yet.
        </Text>
      )}
      {draft.requiredTemplateIds.length > 0 && (
        <Button
          variant="subtle"
          onClick={() => onChange({ requiredTemplateIds: [] })}
        >
          Clear documents
        </Button>
      )}
    </div>
  );
}

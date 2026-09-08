"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Modal,
  Button,
  Group,
} from "@/components/organization/organization-operation-ui";
import type { Team, UserData } from "@/types";
import { teamService } from "@/lib/teamService";
import { ImageUploader } from "./ImageUploader";
import {
  emptyTeamDraft,
  prepareTeamCreation,
  updateTeamDraft,
  type CreateTeamDraft,
} from "./createTeamDraft";
import {
  TeamDocumentFields,
  TeamIdentityFields,
  TeamMembershipFields,
  TeamRegistrationFields,
} from "./CreateTeamFields";
import { useTeamDocumentOptions } from "./useTeamDocumentOptions";

interface CreateTeamModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserData | null;
  onTeamCreated?: (team: Team) => void;
  organizationId?: string;
}

export default function CreateTeamModal(props: CreateTeamModalProps) {
  return (
    <CreateTeamDialog key={props.organizationId ?? "personal"} {...props} />
  );
}

function CreateTeamDialog({
  isOpen,
  onClose,
  currentUser,
  onTeamCreated,
  organizationId,
}: CreateTeamModalProps) {
  const [draft, setDraft] = useState(emptyTeamDraft);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const templates = useTeamDocumentOptions(isOpen, organizationId);
  useEffect(() => {
    if (isOpen) setError(null);
  }, [isOpen]);
  const changeDraft = (patch: Partial<CreateTeamDraft>) =>
    setDraft((current) => updateTeamDraft(current, patch));
  const close = () => {
    if (!pending.current) onClose();
  };

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending.current || templates.status !== "ready") return;
    const result = prepareTeamCreation(draft, currentUser, organizationId);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    pending.current = true;
    setCreating(true);
    setError(null);
    try {
      const team = await teamService.createTeam(...result.args);
      onTeamCreated?.(team);
      setDraft(emptyTeamDraft());
      onClose();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Failed to create team.",
      );
    } finally {
      pending.current = false;
      setCreating(false);
    }
  }

  return (
    <Modal
      opened={isOpen}
      onClose={close}
      title="Create New Team"
      size="lg"
      centered
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert color="red">{error}</Alert>}
        <fieldset
          disabled={creating}
          aria-busy={creating}
          className="m-0 min-w-0 space-y-4 border-0 p-0"
        >
          <TeamIdentityFields draft={draft} onChange={changeDraft} />
          <TeamRegistrationFields
            draft={draft}
            onChange={changeDraft}
            canCharge={Boolean(currentUser?.hasStripeAccount)}
          />
          <TeamMembershipFields draft={draft} onChange={changeDraft} />
          {organizationId && (
            <TeamDocumentFields
              draft={draft}
              onChange={changeDraft}
              templates={templates}
            />
          )}
          <div className="space-y-2">
            <p className="text-sm font-medium">Team Logo (Optional)</p>
            <ImageUploader
              currentImageUrl={draft.imageUrl}
              className="w-full"
              placeholder="Select team logo"
              readOnly={creating}
              onChange={(profileImageId, imageUrl) =>
                changeDraft({ profileImageId, imageUrl })
              }
            />
          </div>
        </fieldset>
        <Group justify="space-between" className="pt-3">
          <Button variant="default" onClick={close} disabled={creating}>
            Cancel
          </Button>
          <Button
            type="submit"
            loading={creating}
            disabled={templates.status !== "ready" || !draft.name.trim()}
          >
            {creating ? "Creating…" : "Create Team"}
          </Button>
        </Group>
      </form>
    </Modal>
  );
}

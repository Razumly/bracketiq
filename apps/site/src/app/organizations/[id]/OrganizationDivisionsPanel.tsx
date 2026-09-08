"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Paper,
} from "@/components/organization/organization-operation-ui";
import { notifications } from "@/lib/organizationNotifications";
import type { Division, Organization } from "@/types";
import { organizationService } from "@/lib/organizationService";
import { useSports } from "@/app/hooks/useSports";
import { useOrganizationDataLoading } from "@/components/organization/OrganizationDataLoading";

import {
  DivisionEditor,
  DivisionHeading,
  DivisionTable,
} from "./OrganizationDivisionViews";
import {
  emptyDivisionDraft,
  newDivisionDraft,
  editDivisionDraft,
  divisionOptions,
  divisionPayload,
  type DivisionTypePayload,
} from "./organizationDivisionModel";

type Props = {
  organization: Organization;
  canManage?: boolean;
  summary?: boolean;
  onChanged?: (divisions: Division[]) => void;
};

export default function OrganizationDivisionsPanel({
  organization,
  canManage = false,
  summary = false,
  onChanged,
}: Props) {
  const { sports, loading: sportsLoading, error: sportsError } = useSports();
  const [divisions, setDivisions] = useState<Division[]>(
    organization.divisions ?? [],
  );
  const [types, setTypes] = useState<DivisionTypePayload>({});
  const [loading, setLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const isDataLoading = useOrganizationDataLoading(isFetching || sportsLoading);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyDivisionDraft);
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;

  useEffect(() => {
    setExpanded(false);
  }, [organization.$id]);

  useEffect(() => {
    let active = true;
    setIsFetching(true);
    setError(null);
    Promise.all([
      organizationService.listOrganizationDivisions(
        organization.$id,
        canManage,
      ),
      fetch("/api/division-types").then((response) => {
        if (!response.ok) throw new Error("Failed to load division options");
        return response.json() as Promise<DivisionTypePayload>;
      }),
    ])
      .then(([nextDivisions, nextTypes]) => {
        if (!active) return;
        setDivisions(nextDivisions);
        setTypes(nextTypes);
        onChangedRef.current?.(nextDivisions);
      })
      .catch((loadError) => {
        if (active)
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load divisions.",
          );
      })
      .finally(() => {
        if (active) setIsFetching(false);
      });
    return () => {
      active = false;
    };
  }, [canManage, organization.$id]);

  const visibleDivisions = useMemo(
    () =>
      divisions.filter((division) => canManage || division.status === "ACTIVE"),
    [canManage, divisions],
  );
  const rows = useMemo(
    () =>
      summary && !expanded ? visibleDivisions.slice(0, 2) : visibleDivisions,
    [summary, expanded, visibleDivisions],
  );
  const options = divisionOptions(sports, types, draft.sportId);
  const displayError = error ?? sportsError?.message ?? null;

  const openCreate = () => {
    setEditingId(null);
    setDraft(newDivisionDraft(sports, types));
    setOpened(true);
  };
  const openEdit = (division: Division) => {
    setEditingId(division.id);
    setDraft(editDivisionDraft(division));
    setOpened(true);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = divisionPayload(draft);
      if (editingId) {
        await organizationService.updateOrganizationDivision(
          organization.$id,
          editingId,
          payload,
        );
      } else {
        await organizationService.createOrganizationDivision(
          organization.$id,
          payload,
        );
      }
      const nextDivisions = await organizationService.listOrganizationDivisions(
        organization.$id,
        canManage,
      );
      setDivisions(nextDivisions);
      onChanged?.(nextDivisions);
      setOpened(false);
      notifications.show({
        color: "teal",
        message: editingId ? "Division updated." : "Division added.",
      });
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save division.",
      );
    } finally {
      setSaving(false);
    }
  };

  const archive = async (division: Division) => {
    setLoading(true);
    try {
      await organizationService.archiveOrganizationDivision(
        organization.$id,
        division.id,
      );
      const nextDivisions = await organizationService.listOrganizationDivisions(
        organization.$id,
        canManage,
      );
      setDivisions(nextDivisions);
      onChanged?.(nextDivisions);
      notifications.show({ color: "teal", message: "Division archived." });
    } catch (archiveError) {
      setError(
        archiveError instanceof Error
          ? archiveError.message
          : "Unable to archive division.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Paper withBorder p="md" radius="md" className="org-tab-surface">
      <DivisionHeading
        summary={summary}
        visibleCount={visibleDivisions.length}
        expanded={expanded}
        onToggle={() => setExpanded((current) => !current)}
        canManage={canManage}
        openCreate={openCreate}
        unavailable={isDataLoading || Boolean(displayError)}
      />
      {displayError && (
        <Alert color="red" mb="md">
          {displayError}
        </Alert>
      )}
      <DivisionTable
        rows={rows}
        canManage={canManage}
        summary={summary}
        isDataLoading={isDataLoading}
        error={displayError}
        sports={sports}
        types={types}
        openEdit={openEdit}
        archive={archive}
        loading={loading}
      />
      <DivisionEditor
        error={displayError}
        opened={opened}
        editingId={editingId}
        saving={saving}
        draft={draft}
        types={types}
        options={options}
        onChange={setDraft}
        onClose={() => {
          if (!saving) setOpened(false);
        }}
        onSave={save}
      />
    </Paper>
  );
}

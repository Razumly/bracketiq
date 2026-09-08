"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/apiClient";

type TemplateRow = {
  $id?: string;
  id?: string;
  title?: string;
  status?: string;
};
type TemplateOption = { value: string; label: string };
type TemplateState = {
  organizationId?: string;
  options: TemplateOption[];
  status: "loading" | "ready" | "error";
};

function templateOption(row: TemplateRow): TemplateOption {
  const value = String(row.$id ?? row.id ?? "").trim();
  const label = String(row.title ?? "").trim();
  if (!value || !label)
    throw new Error("A document template is missing its name or identifier.");
  return { value, label };
}

export function useTeamDocumentOptions(
  isOpen: boolean,
  organizationId?: string,
) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<TemplateState>({
    options: [],
    status: "loading",
  });
  useEffect(() => {
    if (!isOpen || !organizationId) return;
    let cancelled = false;
    setState({ organizationId, options: [], status: "loading" });
    async function load() {
      try {
        const response = await apiRequest<{ templates: TemplateRow[] }>(
          `/api/organizations/${organizationId}/templates`,
        );
        if (!Array.isArray(response.templates))
          throw new Error("Document templates are missing.");
        const options = response.templates
          .filter((row) => row.status?.trim().toUpperCase() !== "ARCHIVED")
          .map(templateOption);
        if (!cancelled) setState({ organizationId, options, status: "ready" });
      } catch {
        if (!cancelled)
          setState({ organizationId, options: [], status: "error" });
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [isOpen, organizationId, attempt]);
  const scoped =
    state.organizationId === organizationId
      ? state
      : { options: [], status: "loading" as const };
  const status = organizationId ? scoped.status : "ready";
  return {
    options: scoped.options,
    status,
    retry: () => setAttempt((value) => value + 1),
  };
}

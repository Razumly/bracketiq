"use client";

import type { ComponentProps } from "react";

import OrganizationPublicSettingsPanel from "./OrganizationPublicSettingsPanel";

export type OrganizationPublicSettingsTabContentProps = ComponentProps<
  typeof OrganizationPublicSettingsPanel
>;

export default function OrganizationPublicSettingsTabContent(
  props: OrganizationPublicSettingsTabContentProps,
) {
  return <OrganizationPublicSettingsPanel {...props} />;
}

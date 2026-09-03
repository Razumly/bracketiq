"use client";

import type { ComponentProps } from "react";

import OrganizationDivisionsPanel from "./OrganizationDivisionsPanel";

export type OrganizationDivisionsTabContentProps = ComponentProps<
  typeof OrganizationDivisionsPanel
>;

export default function OrganizationDivisionsTabContent(
  props: OrganizationDivisionsTabContentProps,
) {
  return <OrganizationDivisionsPanel {...props} />;
}

"use client";

import type { ComponentProps } from "react";

import DiscountManager from "@/components/discounts/DiscountManager";

export type OrganizationDiscountsTabContentProps = ComponentProps<
  typeof DiscountManager
>;

export default function OrganizationDiscountsTabContent(
  props: OrganizationDiscountsTabContentProps,
) {
  return <DiscountManager {...props} />;
}

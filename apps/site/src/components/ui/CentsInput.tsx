"use client";

import type { ComponentProps } from "react";

import { TextInput } from "@/components/organization/organization-operation-ui";

import {
  formatPriceInputValue,
  parsePriceInputToCents,
} from "@/lib/priceUtils";

type CentsInputProps = Omit<
  ComponentProps<typeof TextInput>,
  "defaultValue" | "onChange" | "type" | "value"
> & {
  blankWhenZero?: boolean;
  maw?: number | string;
  maxCents?: number;
  onChange?: (value: number) => void;
  value?: number | null;
};

export default function CentsInput({
  blankWhenZero = true,
  inputMode = "numeric",
  leftSection = "$",
  maw,
  maxCents,
  onChange,
  placeholder = "0.00",
  value,
  ...props
}: CentsInputProps) {
  return (
    <TextInput
      {...props}
      autoComplete="off"
      inputMode={inputMode}
      leftSection={leftSection}
      onChange={(event) => {
        onChange?.(
          parsePriceInputToCents(event.currentTarget.value, { maxCents }),
        );
      }}
      placeholder={placeholder}
      style={{ maxWidth: maw, ...props.style }}
      type="text"
      value={formatPriceInputValue(value, { blankWhenZero, maxCents })}
    />
  );
}

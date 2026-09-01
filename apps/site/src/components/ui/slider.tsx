"use client"

import * as React from "react"
import { Slider as SliderPrimitive } from "@base-ui/react/slider"

import { mergeBaseUIClassName } from "@/lib/utils"

const sliderRootClasses =
  "group/slider relative w-full min-w-0 max-w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-fit"

const sliderThumbClasses =
  "relative block size-5 shrink-0 cursor-grab rounded-full border border-primary bg-background shadow-xs ring-ring/50 transition-[background-color,border-color,box-shadow] select-none after:absolute after:-inset-3 after:rounded-full hover:ring-3 has-[:focus-visible]:border-ring has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring active:cursor-grabbing active:ring-3 motion-reduce:transition-none data-disabled:pointer-events-none data-disabled:cursor-not-allowed data-disabled:opacity-50 group-data-[readonly]/slider:cursor-default"

const sliderValueChangeKeys: Partial<Record<string, true>> = {
  ArrowDown: true,
  ArrowLeft: true,
  ArrowRight: true,
  ArrowUp: true,
  End: true,
  Home: true,
  PageDown: true,
  PageUp: true,
}

type SliderProps<Value extends readonly number[] = readonly number[]> =
  SliderPrimitive.Root.Props<Value> & {
    getAriaLabel?: SliderPrimitive.Thumb.Props["getAriaLabel"]
    getAriaValueText?: SliderPrimitive.Thumb.Props["getAriaValueText"]
    readOnly?: boolean
  }


type ResolvedSliderValues<Value extends readonly number[]> = {
  resolvedDefaultValue: SliderProps<Value>["defaultValue"]
  values: readonly number[]
}

function resolveSliderValues<Value extends readonly number[]>(
  value: SliderProps<Value>["value"],
  defaultValue: SliderProps<Value>["defaultValue"],
  min: number
): ResolvedSliderValues<Value> {
  return {
    values: value ?? defaultValue ?? [min],
    resolvedDefaultValue:
      value === undefined && defaultValue === undefined
        ? ([min] as unknown as Value)
        : defaultValue,
  }
}


function cancelReadOnlyChange(
  _value: readonly number[],
  eventDetails: SliderPrimitive.Root.ChangeEventDetails
) {
  eventDetails.cancel()
}

function preventReadOnlyValueChange(
  event: React.KeyboardEvent<HTMLInputElement>
) {
  if (sliderValueChangeKeys[event.key] === true) {
    event.preventDefault()
  }
}

function Slider<Value extends readonly number[] = readonly number[]>({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  readOnly = false,
  getAriaLabel,
  getAriaValueText,
  onValueChange,
  thumbAlignment = "edge",
  ...props
}: SliderProps<Value>) {
  const { values, resolvedDefaultValue } = resolveSliderValues(
    value,
    defaultValue,
    min
  )
  const rootClassName = mergeBaseUIClassName(sliderRootClasses, className)
  const setInputReadOnlyState = React.useCallback(
    (input: HTMLInputElement | null) => {
      if (!input) {
        return
      }
      if (readOnly) {
        input.setAttribute("aria-readonly", "true")
      } else {
        input.removeAttribute("aria-readonly")
      }
    },
    [readOnly]
  )

  return (
    <SliderPrimitive.Root<Value>
      {...props}
      className={rootClassName}
      data-slot="slider"
      defaultValue={resolvedDefaultValue}
      value={value}
      min={min}
      max={max}
      thumbAlignment={thumbAlignment}
      onValueChange={readOnly ? cancelReadOnlyChange : onValueChange}
      data-readonly={readOnly ? "" : undefined}
    >
      <SliderPrimitive.Control className="relative flex min-w-0 touch-none items-center select-none data-disabled:pointer-events-none data-disabled:cursor-not-allowed data-disabled:opacity-50 data-[orientation=horizontal]:min-h-11 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-11 data-[orientation=vertical]:min-w-11 data-[orientation=vertical]:flex-col group-data-[readonly]/slider:pointer-events-none group-data-[readonly]/slider:cursor-default group-data-[readonly]/slider:opacity-70">
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="relative grow overflow-hidden rounded-full bg-control-track select-none data-[orientation=horizontal]:h-1.5 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1.5"
        >
          <SliderPrimitive.Indicator
            data-slot="slider-range"
            className="bg-primary select-none data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full"
          />
        </SliderPrimitive.Track>
        {Array.from({ length: values.length }, (_, index) => (
          <SliderPrimitive.Thumb
            data-slot="slider-thumb"
            key={index}
            index={index}
            getAriaLabel={getAriaLabel}
            getAriaValueText={getAriaValueText}
            inputRef={setInputReadOnlyState}
            onKeyDown={readOnly ? preventReadOnlyValueChange : undefined}
            className={sliderThumbClasses}
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

export { Slider }

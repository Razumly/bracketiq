import React from "react"
import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { Calendar } from "../calendar"
import { DatePicker } from "../date-picker"
import { Slider } from "../slider"

const augustFirst = new Date(2026, 7, 1)
const augustTenth = new Date(2026, 7, 10)

describe("Slider", () => {
  let elementRectSpy: jest.SpyInstance

  beforeEach(() => {
    elementRectSpy = jest
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(() => new DOMRect(0, 0, 200, 44))
  })

  afterEach(() => {
    elementRectSpy.mockRestore()
  })

  it("changes its value with an arrow key", async () => {
    const user = userEvent.setup()
    render(<Slider defaultValue={[20]} getAriaLabel={() => "Registration limit"} />)

    const slider = await screen.findByRole("slider", {
      name: "Registration limit",
    })
    await user.tab()
    await user.keyboard("{ArrowRight}")

    expect(slider).toHaveValue("21")
  })

  it("does not change or call back while disabled", async () => {
    const user = userEvent.setup()
    const onValueChange = jest.fn()
    render(
      <Slider
        defaultValue={[20]}
        disabled
        getAriaLabel={() => "Registration limit"}
        onValueChange={onValueChange}
      />
    )

    const slider = await screen.findByRole("slider", {
      name: "Registration limit",
    })
    expect(slider).toBeDisabled()
    await user.click(slider)
    await user.keyboard("{ArrowRight}")

    expect(slider).toHaveValue("20")
    expect(onValueChange).not.toHaveBeenCalled()
  })

  it("exposes read-only state on each focusable thumb and blocks changes", async () => {
    const user = userEvent.setup()
    const onValueChange = jest.fn()
    const { rerender } = render(
      <>
        <Slider
          defaultValue={[20, 80]}
          readOnly
          getAriaLabel={(index) =>
            index === 0 ? "Minimum age" : "Maximum age"
          }
          onValueChange={onValueChange}
        />
        <button type="button">After slider</button>
      </>
    )

    const group = screen.getByRole("group")
    const sliders = await screen.findAllByRole("slider")

    expect(group).not.toHaveAttribute("aria-readonly")
    expect(sliders).toHaveLength(2)
    for (const slider of sliders) {
      expect(slider).toHaveAttribute("aria-readonly", "true")
      expect(slider).not.toBeDisabled()
      act(() => slider.focus())
      expect(slider).toHaveFocus()
      await user.keyboard("{ArrowRight}")
    }

    await user.tab()
    expect(screen.getByRole("button", { name: "After slider" })).toHaveFocus()
    await user.tab({ shift: true })
    expect(sliders[1]).toHaveFocus()

    expect(sliders[0]).toHaveValue("20")
    expect(sliders[1]).toHaveValue("80")
    expect(onValueChange).not.toHaveBeenCalled()

    rerender(
      <>
        <Slider
          defaultValue={[20, 80]}
          getAriaLabel={(index) =>
            index === 0 ? "Minimum age" : "Maximum age"
          }
          onValueChange={onValueChange}
        />
        <button type="button">After slider</button>
      </>
    )

    screen.getAllByRole("slider").forEach((slider) => {
      expect(slider).not.toHaveAttribute("aria-readonly")
    })
  })

  it("reports the complete two-thumb range when either value changes", async () => {
    const user = userEvent.setup()
    const onValueChange = jest.fn()

    function RangeExample() {
      const [value, setValue] = React.useState<readonly number[]>([20, 80])
      return (
        <Slider
          value={value}
          getAriaLabel={(index) => (index === 0 ? "Minimum age" : "Maximum age")}
          onValueChange={(nextValue, details) => {
            onValueChange(nextValue, details)
            setValue(nextValue)
          }}
        />
      )
    }

    render(<RangeExample />)

    const minimum = await screen.findByRole("slider", { name: "Minimum age" })
    const maximum = screen.getByRole("slider", { name: "Maximum age" })
    await user.tab()
    await user.keyboard("{ArrowRight}")

    expect(minimum).toHaveValue("21")
    expect(maximum).toHaveValue("80")
    expect(onValueChange.mock.calls.at(-1)?.[0]).toEqual([21, 80])
  })
})

describe("Calendar and DatePicker", () => {
  it("calls Calendar selection with the day a user chooses", async () => {
    const user = userEvent.setup()
    const onSelect = jest.fn()
    render(
      <Calendar
        mode="single"
        defaultMonth={augustFirst}
        onSelect={onSelect}
      />
    )

    await user.click(
      screen.getByRole("button", { name: /Monday, August 10th, 2026/i })
    )

    expect(onSelect.mock.calls[0]?.[0]).toEqual(augustTenth)
  })

  it("preserves the calendar subtree across a controlled selection rerender", async () => {
    const user = userEvent.setup()

    function ControlledCalendar() {
      const [selected, setSelected] = React.useState<Date | undefined>(
        augustFirst
      )

      return (
        <Calendar
          mode="single"
          defaultMonth={augustFirst}
          selected={selected}
          onSelect={setSelected}
        />
      )
    }

    render(<ControlledCalendar />)

    const preservedDay = screen.getByRole("button", {
      name: /Tuesday, August 11th, 2026/i,
    })
    await user.click(
      screen.getByRole("button", { name: /Monday, August 10th, 2026/i })
    )

    expect(
      screen.getByRole("button", {
        name: /Tuesday, August 11th, 2026/i,
      })
    ).toBe(preservedDay)
  })

  it("updates its visible month and year through named caption dropdowns", async () => {
    const user = userEvent.setup()
    render(
      <Calendar
        captionLayout="dropdown"
        defaultMonth={augustFirst}
        startMonth={new Date(2025, 0, 1)}
        endMonth={new Date(2027, 11, 31)}
      />
    )

    const monthDropdown = screen.getByRole("combobox", {
      name: "Choose the Month",
    })
    const yearDropdown = screen.getByRole("combobox", {
      name: "Choose the Year",
    })

    await user.tab()
    await user.tab()
    await user.tab()
    expect(monthDropdown).toHaveFocus()

    await user.selectOptions(monthDropdown, "10")
    expect(
      screen.getByRole("grid", { name: "November 2026" })
    ).toBeInTheDocument()

    await user.selectOptions(yearDropdown, "2027")
    expect(
      screen.getByRole("grid", { name: "November 2027" })
    ).toBeInTheDocument()
  })

  it("opens DatePicker, selects a day, calls back, and closes", async () => {
    const user = userEvent.setup()
    const onValueChange = jest.fn()

    function DatePickerExample() {
      const [value, setValue] = React.useState<Date | undefined>(augustFirst)
      return (
        <DatePicker
          label="Start date"
          value={value}
          onValueChange={(nextValue) => {
            onValueChange(nextValue)
            setValue(nextValue)
          }}
        />
      )
    }

    render(<DatePickerExample />)

    const trigger = screen.getByRole("button", {
      name: "Start date: August 1st, 2026",
    })
    await user.click(trigger)
    expect(
      await screen.findByRole("dialog", { name: "Start date calendar" })
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", { name: /Monday, August 10th, 2026/i })
    )

    expect(onValueChange).toHaveBeenCalledWith(augustTenth)
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Start date calendar" })
      ).not.toBeInTheDocument()
    )
    expect(trigger).toHaveAccessibleName("Start date: August 10th, 2026")
    expect(trigger).toHaveFocus()
  })

  it("closes an open DatePicker when disabled and keeps it inert", async () => {
    const user = userEvent.setup()
    const onValueChange = jest.fn()
    const { rerender } = render(
      <DatePicker
        label="Start date"
        value={augustFirst}
        onValueChange={onValueChange}
      />
    )

    const trigger = screen.getByRole("button", {
      name: "Start date: August 1st, 2026",
    })
    await user.click(trigger)
    expect(
      await screen.findByRole("dialog", { name: "Start date calendar" })
    ).toBeInTheDocument()

    rerender(
      <DatePicker
        label="Start date"
        value={augustFirst}
        onValueChange={onValueChange}
        disabled
      />
    )

    expect(trigger).toBeDisabled()
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Start date calendar" })
      ).not.toBeInTheDocument()
    )
    expect(onValueChange).not.toHaveBeenCalled()

    trigger.click()

    expect(
      screen.queryByRole("dialog", { name: "Start date calendar" })
    ).not.toBeInTheDocument()

    rerender(
      <DatePicker
        label="Start date"
        value={augustFirst}
        onValueChange={onValueChange}
      />
    )
    expect(trigger).not.toBeDisabled()
    expect(
      screen.queryByRole("dialog", { name: "Start date calendar" })
    ).not.toBeInTheDocument()
    expect(onValueChange).not.toHaveBeenCalled()
  })
})

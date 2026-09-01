import React from "react"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { Button } from "../button"
import { Checkbox } from "../checkbox"
import { Field, FieldLabel } from "../field"
import { Input } from "../input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupTextarea,
} from "../input-group"
import { Label } from "../label"
import { RadioGroup, RadioGroupItem } from "../radio-group"
import { Textarea } from "../textarea"

describe("control primitives", () => {
  it("activates an enabled Button but not a disabled Button", async () => {
    const user = userEvent.setup()
    const onEnabledClick = jest.fn()
    const onDisabledClick = jest.fn()

    render(
      <>
        <Button onClick={onEnabledClick}>Create team</Button>
        <Button disabled onClick={onDisabledClick}>
          Delete team
        </Button>
      </>
    )

    await user.click(screen.getByRole("button", { name: "Create team" }))
    await user.click(screen.getByRole("button", { name: "Delete team" }))

    expect(onEnabledClick).toHaveBeenCalledTimes(1)
    expect(onDisabledClick).not.toHaveBeenCalled()
  })

  it("preserves Button className state callbacks and string classes", () => {
    const disabledStates: boolean[] = []
    const statefulClassName: React.ComponentProps<typeof Button>["className"] = (
      state
    ) => {
      disabledStates.push(state.disabled)
      return state.disabled ? "caller-disabled" : "caller-enabled"
    }
    const { rerender } = render(
      <Button className={statefulClassName}>Save team</Button>
    )
    const button = screen.getByRole("button", { name: "Save team" })

    expect(button).toHaveClass("caller-enabled")
    expect(disabledStates).toContain(false)

    rerender(
      <Button className={statefulClassName} disabled>
        Save team
      </Button>
    )

    expect(button).toHaveClass("caller-disabled")
    expect(disabledStates).toContain(true)

    rerender(<Button className="caller-string">Save team</Button>)

    expect(button).toHaveClass("caller-string")
  })

  it("associates Field and native labels with Input and Textarea controls", () => {
    render(
      <>
        <Field>
          <FieldLabel htmlFor="team-name">Team name</FieldLabel>
          <Input id="team-name" />
        </Field>
        <Label htmlFor="team-notes">Team notes</Label>
        <Textarea id="team-notes" />
      </>
    )

    expect(screen.getByRole("textbox", { name: "Team name" })).toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: "Team notes" })).toBeInTheDocument()
  })

  it("focuses input and textarea controls from their text add-ons", async () => {
    const user = userEvent.setup()

    render(
      <>
        <InputGroup>
          <InputGroupAddon>https://</InputGroupAddon>
          <InputGroupInput aria-label="Team website" />
        </InputGroup>
        <InputGroup>
          <InputGroupTextarea aria-label="Team notes" />
          <InputGroupAddon>Notes</InputGroupAddon>
        </InputGroup>
      </>
    )

    const input = screen.getByRole("textbox", { name: "Team website" })
    const textarea = screen.getByRole("textbox", { name: "Team notes" })

    await user.click(screen.getByText("https://"))
    expect(input).toHaveFocus()

    await user.click(screen.getByText("Notes"))
    expect(textarea).toHaveFocus()
  })

  it("composes add-on clicks and lets callers prevent control focus", async () => {
    const user = userEvent.setup()
    const onClick = jest.fn()
    const onPreventedClick = jest.fn(
      (event: React.MouseEvent<HTMLDivElement>) => event.preventDefault()
    )

    render(
      <>
        <InputGroup>
          <InputGroupAddon onClick={onClick}>Compose</InputGroupAddon>
          <InputGroupInput aria-label="Composed control" />
        </InputGroup>
        <InputGroup>
          <InputGroupAddon onClick={onPreventedClick}>Prevent</InputGroupAddon>
          <InputGroupTextarea aria-label="Prevented control" />
        </InputGroup>
      </>
    )

    const composedControl = screen.getByRole("textbox", {
      name: "Composed control",
    })
    const preventedControl = screen.getByRole("textbox", {
      name: "Prevented control",
    })

    await user.click(screen.getByText("Compose"))
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(composedControl).toHaveFocus()

    await user.click(screen.getByText("Prevent"))
    expect(onPreventedClick).toHaveBeenCalledTimes(1)
    expect(preventedControl).not.toHaveFocus()
  })

  it("toggles Checkbox checked state with user activation", async () => {
    const user = userEvent.setup()

    render(<Checkbox aria-label="Accept terms" />)

    const checkbox = screen.getByRole("checkbox", { name: "Accept terms" })
    expect(checkbox).not.toBeChecked()

    await user.click(checkbox)

    expect(checkbox).toBeChecked()
  })

  it("exposes and visibly distinguishes a mixed Checkbox state", () => {
    const { rerender } = render(
      <Checkbox checked aria-label="Select all teams" />
    )

    const checkedCheckbox = screen.getByRole("checkbox", {
      name: "Select all teams",
    })
    expect(
      checkedCheckbox.querySelector('[data-slot="checkbox-checked-mark"]')
    ).toBeVisible()

    rerender(
      <Checkbox
        checked={false}
        indeterminate
        aria-label="Select all teams"
      />
    )

    const mixedCheckbox = screen.getByRole("checkbox", {
      name: "Select all teams",
    })
    expect(mixedCheckbox).toBePartiallyChecked()
    expect(
      mixedCheckbox.querySelector(
        '[data-slot="checkbox-indeterminate-mark"]'
      )
    ).toBeVisible()
    expect(
      mixedCheckbox.querySelector('[data-slot="checkbox-checked-mark"]')
    ).not.toBeInTheDocument()
  })

  it("moves Radio Group selection with an arrow key", async () => {
    const user = userEvent.setup()

    render(
      <RadioGroup defaultValue="soccer" aria-label="Sport">
        <RadioGroupItem value="soccer" aria-label="Soccer" />
        <RadioGroupItem value="basketball" aria-label="Basketball" />
      </RadioGroup>
    )

    const soccer = screen.getByRole("radio", { name: "Soccer" })
    const basketball = screen.getByRole("radio", { name: "Basketball" })
    await user.click(soccer)

    await user.keyboard("{ArrowRight}")

    expect(basketball).toBeChecked()
    expect(basketball).toHaveFocus()
  })
})

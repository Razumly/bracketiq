import React from "react"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
} from "../combobox"
import { Menu, MenuContent, MenuItem, MenuTrigger } from "../menu"
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "../popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../tabs"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../tooltip"

function SelectExample() {
  return (
    <Select
      defaultValue="soccer"
      items={{ soccer: "Soccer", basketball: "Basketball" }}
    >
      <SelectTrigger aria-label="Sport">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="soccer">Soccer</SelectItem>
        <SelectItem value="basketball">Basketball</SelectItem>
      </SelectContent>
    </Select>
  )
}

function ComboboxExample() {
  return (
    <Combobox items={["Soccer", "Basketball"]} defaultValue="Soccer">
      <ComboboxInput aria-label="Sport search" />
      <ComboboxContent>
        <ComboboxList>
          <ComboboxItem value="Soccer">Soccer</ComboboxItem>
          <ComboboxItem value="Basketball">Basketball</ComboboxItem>
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

describe("choice primitives", () => {
  it("opens a named Select from the keyboard, navigates, and selects an option", async () => {
    const user = userEvent.setup()
    render(<SelectExample />)

    const trigger = screen.getByRole("combobox", { name: "Sport" })
    await user.tab()
    await user.keyboard("{ArrowDown}")

    expect(await screen.findByRole("listbox")).toBeInTheDocument()
    await user.keyboard("{ArrowDown}{Enter}")

    expect(trigger).toHaveTextContent("Basketball")
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it("updates Select item callback classes with selected state", async () => {
    const user = userEvent.setup()
    const selectedStates: boolean[] = []

    function StatefulSelect() {
      const [value, setValue] = React.useState("soccer")

      return (
        <Select
          items={{ soccer: "Soccer", basketball: "Basketball" }}
          onValueChange={(nextValue) => {
            if (nextValue !== null) {
              setValue(nextValue)
            }
          }}
          open
          value={value}
        >
          <SelectTrigger aria-label="Stateful sport">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="soccer">Soccer</SelectItem>
            <SelectItem
              className={(state) => {
                selectedStates.push(state.selected)
                return state.selected
                  ? "caller-selected"
                  : "caller-not-selected"
              }}
              value="basketball"
            >
              Basketball
            </SelectItem>
          </SelectContent>
        </Select>
      )
    }

    render(<StatefulSelect />)
    const basketball = await screen.findByRole("option", {
      name: "Basketball",
    })

    expect(basketball).toHaveClass("caller-not-selected")
    expect(selectedStates).toContain(false)

    await user.click(basketball)

    expect(basketball).toHaveClass("caller-selected")
    expect(selectedStates).toContain(true)
  })

  it("closes Select with Escape without changing the selection", async () => {
    const user = userEvent.setup()
    render(<SelectExample />)

    const trigger = screen.getByRole("combobox", { name: "Sport" })
    await user.click(trigger)
    expect(await screen.findByRole("listbox")).toBeInTheDocument()

    await user.keyboard("{Escape}")

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument()
    expect(trigger).toHaveTextContent("Soccer")
    expect(trigger).toHaveFocus()
  })

  it("opens a named Combobox from the keyboard, navigates, and selects an option", async () => {
    const user = userEvent.setup()
    render(<ComboboxExample />)

    const input = screen.getByRole("combobox", { name: "Sport search" })
    await user.tab()
    await user.keyboard("{ArrowDown}")

    expect(await screen.findByRole("listbox")).toBeInTheDocument()
    await user.keyboard("{ArrowDown}{Enter}")

    expect(input).toHaveValue("Basketball")
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument()
    expect(input).toHaveFocus()
  })

  it("closes Combobox with Escape without changing the selection", async () => {
    const user = userEvent.setup()
    render(<ComboboxExample />)

    const input = screen.getByRole("combobox", { name: "Sport search" })
    await user.tab()
    await user.keyboard("{ArrowDown}")
    expect(await screen.findByRole("listbox")).toBeInTheDocument()

    await user.keyboard("{Escape}")

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument()
    expect(input).toHaveValue("Soccer")
    expect(input).toHaveFocus()
  })

  it("keeps a disabled Combobox input closed and inert", async () => {
    const user = userEvent.setup()
    const onValueChange = jest.fn()

    render(
      <Combobox
        items={["Soccer", "Basketball"]}
        defaultValue="Soccer"
        onValueChange={onValueChange}
      >
        <ComboboxInput aria-label="Disabled sport search" disabled />
        <ComboboxContent>
          <ComboboxList>
            <ComboboxItem value="Soccer">Soccer</ComboboxItem>
            <ComboboxItem value="Basketball">Basketball</ComboboxItem>
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    )

    const input = screen.getByRole("combobox", {
      name: "Disabled sport search",
    })
    expect(input).toBeDisabled()
    expect(input).toHaveAttribute("data-disabled")

    await user.click(input)
    await user.keyboard("{ArrowDown}")

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument()
    expect(onValueChange).not.toHaveBeenCalled()
  })

  it("names chip remove buttons and removes through the real Combobox control", async () => {
    const user = userEvent.setup()
    render(
      <Combobox
        items={["Soccer", "Basketball"]}
        defaultValue={["Soccer", "Basketball"]}
        multiple
      >
        <ComboboxChips>
          <ComboboxValue>
            {(value: string[]) =>
              value.map((sport) => (
                <ComboboxChip
                  key={sport}
                  removeLabel={sport === "Soccer" ? `Remove ${sport}` : undefined}
                >
                  {sport}
                </ComboboxChip>
              ))
            }
          </ComboboxValue>
          <ComboboxChipsInput aria-label="Sports search" />
        </ComboboxChips>
      </Combobox>
    )

    expect(
      screen.getByRole("button", { name: "Remove item" })
    ).toBeInTheDocument()
    const removeSoccer = screen.getByRole("button", {
      name: "Remove Soccer",
    })

    await user.click(removeSoccer)

    expect(
      screen.queryByRole("button", { name: "Remove Soccer" })
    ).not.toBeInTheDocument()
    expect(screen.queryByText("Soccer")).not.toBeInTheDocument()
  })

  it("activates the next Tab with an arrow key", async () => {
    const user = userEvent.setup()
    render(
      <Tabs defaultValue="details">
        <TabsList aria-label="Team sections" activateOnFocus>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="roster">Roster</TabsTrigger>
        </TabsList>
        <TabsContent value="details">Team details</TabsContent>
        <TabsContent value="roster">Team roster</TabsContent>
      </Tabs>
    )

    const details = screen.getByRole("tab", { name: "Details" })
    const roster = screen.getByRole("tab", { name: "Roster" })
    await user.click(details)

    await user.keyboard("{ArrowRight}")

    expect(roster).toHaveAttribute("aria-selected", "true")
    expect(roster).toHaveFocus()
    expect(screen.getByRole("tabpanel", { name: "Roster" })).toHaveTextContent(
      "Team roster"
    )
  })

  it("opens Menu and closes it after an item is selected", async () => {
    const user = userEvent.setup()
    const onRename = jest.fn()
    render(
      <Menu>
        <MenuTrigger>Team actions</MenuTrigger>
        <MenuContent>
          <MenuItem onClick={onRename}>Rename team</MenuItem>
        </MenuContent>
      </Menu>
    )

    const trigger = screen.getByRole("button", { name: "Team actions" })
    await user.click(trigger)
    const item = await screen.findByRole("menuitem", { name: "Rename team" })

    await user.click(item)

    expect(onRename).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("menuitem", { name: "Rename team" })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it("opens Popover and closes it through its labeled close control", async () => {
    const user = userEvent.setup()
    render(
      <Popover>
        <PopoverTrigger>View schedule</PopoverTrigger>
        <PopoverContent>
          <PopoverTitle>Team schedule</PopoverTitle>
          <PopoverClose>Close schedule</PopoverClose>
        </PopoverContent>
      </Popover>
    )

    const trigger = screen.getByRole("button", { name: "View schedule" })
    await user.click(trigger)
    expect(await screen.findByRole("dialog", { name: "Team schedule" })).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Close schedule" }))

    expect(screen.queryByRole("dialog", { name: "Team schedule" })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it("shows Tooltip on hover and hides it when hover ends", async () => {
    const user = userEvent.setup()
    render(
      <TooltipProvider delay={0}>
        <Tooltip>
          <TooltipTrigger>Registration status</TooltipTrigger>
          <TooltipContent>Registration is open</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )

    const trigger = screen.getByRole("button", { name: "Registration status" })
    await user.hover(trigger)
    expect(await screen.findByText("Registration is open")).toBeVisible()

    await user.unhover(trigger)

    await waitFor(() =>
      expect(screen.queryByText("Registration is open")).not.toBeInTheDocument()
    )
  })
})

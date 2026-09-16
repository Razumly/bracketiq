import React from "react"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "../dialog"
import { Input } from "../input"
import {
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuGroup,
  MenuItem,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  MenuTrigger,
} from "../menu"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "../sheet"

function DialogExample() {
  const initialFocusRef = React.useRef<HTMLInputElement>(null)

  return (
    <Dialog>
      <DialogTrigger>Edit team</DialogTrigger>
      <DialogContent initialFocus={initialFocusRef}>
        <DialogTitle>Edit team details</DialogTitle>
        <DialogDescription>Change the public team information.</DialogDescription>
        <Input ref={initialFocusRef} aria-label="Team name" />
      </DialogContent>
    </Dialog>
  )
}

function AlertDialogExample({ onConfirm }: { onConfirm: () => void }) {
  const cancelRef = React.useRef<HTMLButtonElement>(null)

  return (
    <AlertDialog>
      <AlertDialogTrigger>Delete team</AlertDialogTrigger>
      <AlertDialogContent initialFocus={cancelRef}>
        <AlertDialogTitle>Delete this team?</AlertDialogTitle>
        <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel ref={cancelRef}>Keep team</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            Confirm deletion
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function SheetExample() {
  const initialFocusRef = React.useRef<HTMLInputElement>(null)

  return (
    <Sheet>
      <SheetTrigger>Open filters</SheetTrigger>
      <SheetContent initialFocus={initialFocusRef}>
        <SheetTitle>Registration filters</SheetTitle>
        <SheetDescription>Narrow the available registrations.</SheetDescription>
        <Input ref={initialFocusRef} aria-label="Search registrations" />
      </SheetContent>
    </Sheet>
  )
}

describe("overlay primitives", () => {
  it("names Dialog, moves initial focus inside, closes on Escape, and returns focus", async () => {
    const user = userEvent.setup()
    render(<DialogExample />)

    const trigger = screen.getByRole("button", { name: "Edit team" })
    await user.click(trigger)

    expect(await screen.findByRole("dialog", { name: "Edit team details" })).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Team name" })).toHaveFocus()
    )

    await user.keyboard("{Escape}")

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Edit team details" })).not.toBeInTheDocument()
    )
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it("updates Dialog callback classes with closed, open, and mounted popup state", async () => {
    const user = userEvent.setup()
    const triggerOpenStates: boolean[] = []
    const popupOpenStates: boolean[] = []

    render(
      <Dialog>
        <DialogTrigger
          className={(state) => {
            triggerOpenStates.push(state.open)
            return state.open ? "caller-trigger-open" : "caller-trigger-closed"
          }}
        >
          Inspect team
        </DialogTrigger>
        <DialogContent
          className={(state) => {
            popupOpenStates.push(state.open)
            return state.open ? "caller-popup-open" : "caller-popup-closed"
          }}
        >
          <DialogTitle>Inspect team details</DialogTitle>
          <DialogDescription>Review the public team information.</DialogDescription>
        </DialogContent>
      </Dialog>
    )

    const trigger = screen.getByRole("button", { name: "Inspect team" })
    expect(trigger).toHaveClass("caller-trigger-closed")
    expect(triggerOpenStates).toContain(false)

    await user.click(trigger)

    const dialog = await screen.findByRole("dialog", {
      name: "Inspect team details",
    })
    expect(trigger).toHaveClass("caller-trigger-open")
    expect(dialog).toHaveClass("caller-popup-open")
    expect(triggerOpenStates).toContain(true)
    expect(popupOpenStates).toContain(true)
  })

  it("names Alert Dialog, moves initial focus inside, closes on Escape, and returns focus", async () => {
    const user = userEvent.setup()
    const onConfirm = jest.fn()
    render(<AlertDialogExample onConfirm={onConfirm} />)

    const trigger = screen.getByRole("button", { name: "Delete team" })
    await user.click(trigger)

    expect(
      await screen.findByRole("alertdialog", { name: "Delete this team?" })
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Keep team" })).toHaveFocus()
    )

    await user.keyboard("{Escape}")

    await waitFor(() =>
      expect(
        screen.queryByRole("alertdialog", { name: "Delete this team?" })
      ).not.toBeInTheDocument()
    )
    expect(onConfirm).not.toHaveBeenCalled()
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it("calls Alert Dialog confirmation once, closes, and returns focus", async () => {
    const user = userEvent.setup()
    const onConfirm = jest.fn()
    render(<AlertDialogExample onConfirm={onConfirm} />)

    const trigger = screen.getByRole("button", { name: "Delete team" })
    await user.click(trigger)
    expect(
      await screen.findByRole("alertdialog", { name: "Delete this team?" })
    ).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Confirm deletion" }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    await waitFor(() =>
      expect(
        screen.queryByRole("alertdialog", { name: "Delete this team?" })
      ).not.toBeInTheDocument()
    )
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it("omits menu inset attributes when inset is false", async () => {
    const user = userEvent.setup()
    render(
      <Menu>
        <MenuTrigger>Open menu</MenuTrigger>
        <MenuContent>
          <MenuGroup>
            <MenuLabel inset={false}>No inset label</MenuLabel>
          </MenuGroup>
          <MenuItem inset={false}>No inset item</MenuItem>
          <MenuSub>
            <MenuSubTrigger inset={false}>No inset submenu</MenuSubTrigger>
            <MenuSubContent>
              <MenuItem>Nested item</MenuItem>
            </MenuSubContent>
          </MenuSub>
          <MenuCheckboxItem checked={false} inset={false}>
            No inset checkbox
          </MenuCheckboxItem>
          <MenuRadioGroup value="first">
            <MenuRadioItem inset={false} value="first">
              No inset radio
            </MenuRadioItem>
          </MenuRadioGroup>
          <MenuGroup>
            <MenuLabel inset>Inset label</MenuLabel>
          </MenuGroup>
        </MenuContent>
      </Menu>
    )

    await user.click(screen.getByRole("button", { name: "Open menu" }))

    for (const element of [
      await screen.findByText("No inset label"),
      screen.getByRole("menuitem", { name: "No inset item" }),
      screen.getByRole("menuitem", { name: "No inset submenu" }),
      screen.getByRole("menuitemcheckbox", { name: "No inset checkbox" }),
      screen.getByRole("menuitemradio", { name: "No inset radio" }),
    ]) {
      expect(element).not.toHaveAttribute("data-inset")
    }
    expect(screen.getByText("Inset label")).toHaveAttribute("data-inset")
  })

  it("names Sheet, moves initial focus inside, closes on Escape, and returns focus", async () => {
    const user = userEvent.setup()
    render(<SheetExample />)

    const trigger = screen.getByRole("button", { name: "Open filters" })
    await user.click(trigger)

    expect(
      await screen.findByRole("dialog", { name: "Registration filters" })
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(
        screen.getByRole("textbox", { name: "Search registrations" })
      ).toHaveFocus()
    )

    await user.keyboard("{Escape}")

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Registration filters" })
      ).not.toBeInTheDocument()
    )
    await waitFor(() => expect(trigger).toHaveFocus())
  })
})

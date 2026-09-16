import React from "react"
import { act, render, screen, waitFor, within } from "@testing-library/react"

import { appNotifications, type NotificationId } from "@/lib/notifications"
import { Toaster } from "../sonner"

afterEach(() => {
  expect(appNotifications.dismiss()).toBeUndefined()
})

describe("application notifications", () => {
  it("announces notifications and dismisses only the targeted notification", async () => {
    render(<Toaster />)

    let notificationId!: NotificationId
    act(() => {
      notificationId = appNotifications.success("Team saved successfully")
      appNotifications.info("Schedule remains visible")
    })

    expect(notificationId).toBeDefined()

    const liveRegion = screen.getByRole("region", {
      name: /Application notifications/i,
    })
    expect(
      await within(liveRegion).findByText("Team saved successfully")
    ).toBeInTheDocument()
    expect(
      await within(liveRegion).findByText("Schedule remains visible")
    ).toBeInTheDocument()

    act(() => {
      appNotifications.dismiss(notificationId)
    })

    await waitFor(() =>
      expect(
        within(liveRegion).queryByText("Team saved successfully")
      ).not.toBeInTheDocument()
    )
    expect(
      within(liveRegion).getByText("Schedule remains visible")
    ).toBeInTheDocument()
  })
})

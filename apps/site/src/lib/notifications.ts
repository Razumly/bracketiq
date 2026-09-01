"use client"

import { toast, type ExternalToast } from "sonner"

export type NotificationOptions = ExternalToast
export type NotificationId = string | number

interface AppNotifications {
  success(message: string, options?: NotificationOptions): NotificationId
  error(message: string, options?: NotificationOptions): NotificationId
  info(message: string, options?: NotificationOptions): NotificationId
  warning(message: string, options?: NotificationOptions): NotificationId
  loading(message: string, options?: NotificationOptions): NotificationId
  dismiss(id?: NotificationId): NotificationId | undefined
}

export const appNotifications: AppNotifications = {
  success: toast.success,
  error: toast.error,
  info: toast.info,
  warning: toast.warning,
  loading: toast.loading,
  dismiss(id) {
    if (id === undefined) {
      toast.dismiss()
      return undefined
    }

    return toast.dismiss(id)
  },
}

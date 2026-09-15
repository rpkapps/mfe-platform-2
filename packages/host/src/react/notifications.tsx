import { toast } from "sonner"
import type { NotificationPort } from "@platform-internal/core"

import { Toaster } from "@tecton/react/components/sonner"

/** Host-side `NotificationPort` backed by sonner; render `<NotificationHost />` once in the shell. */
export function createSonnerNotificationPort(): NotificationPort {
  return {
    notify(notification) {
      const options = {
        description: notification.description,
        duration: notification.durationMs,
      }
      switch (notification.kind) {
        case "success":
          toast.success(notification.title, options)
          break
        case "warning":
          toast.warning(notification.title, options)
          break
        case "error":
          toast.error(notification.title, options)
          break
        case "info":
          toast.info(notification.title, options)
          break
        default:
          toast(notification.title, options)
      }
    },
  }
}

export type NotificationHostProps = Omit<React.ComponentProps<typeof Toaster>, "children">

/** Renders the Tecton toaster the notification port writes to. */
export function NotificationHost(props: NotificationHostProps) {
  return <Toaster position="bottom-right" closeButton {...props} />
}

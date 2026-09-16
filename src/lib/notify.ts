/**
 * Small notification helper: shows an in-app toast and, when the person has
 * allowed it, a desktop/phone notification so progress is visible even when
 * the tab is in the background.
 */
import { toast } from "sonner";

export type NotifyKind = "info" | "success" | "error";

export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  try {
    return (await Notification.requestPermission()) === "granted";
  } catch {
    return false;
  }
}

export function notify(title: string, body?: string, kind: NotifyKind = "info"): void {
  if (kind === "success") toast.success(title, body ? { description: body } : undefined);
  else if (kind === "error") toast.error(title, body ? { description: body } : undefined);
  else toast(title, body ? { description: body } : undefined);

  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    // Only surface the system notification when the tab isn't in focus.
    if (document.visibilityState === "visible" && document.hasFocus()) return;
    new Notification(title, { ...(body ? { body } : {}), tag: title });
  } catch {
    /* notifications are a nicety, never a failure */
  }
}

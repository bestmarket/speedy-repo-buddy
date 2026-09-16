/**
 * Keeps the screen awake while a video is being put together, so locking the
 * phone (or leaving the tab alone) doesn't stall the assembly.
 * Browser-only: every call is safe to make, it simply does nothing when the
 * browser has no wake-lock support.
 */

type WakeLockLike = { release: () => Promise<void>; released: boolean };

export function requestWakeLock(): () => void {
  if (typeof navigator === "undefined") return () => undefined;
  const api = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<WakeLockLike> } })
    .wakeLock;
  if (!api) return () => undefined;

  let lock: WakeLockLike | null = null;
  let stopped = false;

  const acquire = async () => {
    if (stopped || document.visibilityState !== "visible") return;
    try {
      lock = await api.request("screen");
    } catch {
      /* the browser refused — carry on without it */
    }
  };

  const onVisible = () => {
    if (!stopped && document.visibilityState === "visible" && (!lock || lock.released)) {
      void acquire();
    }
  };

  void acquire();
  document.addEventListener("visibilitychange", onVisible);

  return () => {
    stopped = true;
    document.removeEventListener("visibilitychange", onVisible);
    void lock?.release().catch(() => undefined);
    lock = null;
  };
}

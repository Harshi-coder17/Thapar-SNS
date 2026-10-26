"use client";

// Session expiry in the browser (docs/auth/session-policy.md). The server enforces every limit; this
// component only (1) tells the server when the user is actually present, (2) warns before the session
// ends, and (3) when it has ended, lets open forms keep their drafts and goes to the login page with an
// explanation. Tabs share what they learn through a BroadcastChannel, so activity in one tab keeps the
// others' warnings in sync. Nothing here stores or reads credentials (the session cookie is HttpOnly).
import { useEffect, useRef, useState } from "react";

import { Button } from "@/shared/ui/button";

/** Fired just before the app leaves an ended session; forms save drafts on it (UC-10 E2 and others). */
export const SESSION_ENDING_EVENT = "thapar:session-ending";

interface Status {
  deviceClass: "desktop" | "mobile";
  idleExpiresAt: number;
  absoluteExpiresAt: number;
}

const ACTIVITY_PING_MS = 60 * 1000;
const STATUS_POLL_MS = 60 * 1000;
const IDLE_WARNING_MS = 2 * 60 * 1000;
const ABSOLUTE_WARNING_MS = 10 * 60 * 1000;
const CHANNEL = "thapar-sns-session";

const parse = (body: { deviceClass: "desktop" | "mobile"; idleExpiresAt: string; absoluteExpiresAt: string; serverNow: string }): Status => {
  // Server time is authoritative: shift the deadlines by the clock difference.
  const offset = Date.now() - new Date(body.serverNow).getTime();
  return { deviceClass: body.deviceClass, idleExpiresAt: new Date(body.idleExpiresAt).getTime() + offset, absoluteExpiresAt: new Date(body.absoluteExpiresAt).getTime() + offset };
};

const clock = (ms: number) => {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};
const timeOfDay = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });

export function endSession(reason: "expired" | "signed-out" = "expired"): void {
  window.dispatchEvent(new Event(SESSION_ENDING_EVENT));
  try {
    new BroadcastChannel(CHANNEL).postMessage({ type: "ended" });
  } catch {
    // older browsers: other tabs find out on their next request
  }
  // Give draft handlers a moment, then leave with a full page load, so no signed-in client state
  // (router cache, React state) survives the ended session.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full reload is intended
  setTimeout(() => window.location.assign(`/login?reason=${reason}`), 50);
}

export function SessionGuard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const lastPingRef = useRef(0);
  const endedRef = useRef(false);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const pingRef = useRef<(force?: boolean) => Promise<void>>(async () => undefined);

  useEffect(() => {
    const finish = () => {
      if (endedRef.current) return;
      endedRef.current = true;
      endSession("expired");
    };
    const share = (next: Status) => {
      setStatus(next);
      channelRef.current?.postMessage({ type: "status", status: next });
    };
    const fetchStatus = async () => {
      const response = await fetch("/api/identity/session", { cache: "no-store" }).catch(() => null);
      if (!response) return; // offline: keep the last known deadlines
      if (response.status === 401) return finish();
      if (response.ok) share(parse(await response.json()));
    };
    const ping = async (force = false) => {
      if (!force && Date.now() - lastPingRef.current < ACTIVITY_PING_MS) return;
      lastPingRef.current = Date.now();
      const response = await fetch("/api/identity/activity", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).catch(() => null);
      if (!response) return;
      if (response.status === 401) return finish();
      if (response.ok) share(parse(await response.json()));
    };
    try {
      channelRef.current = new BroadcastChannel(CHANNEL);
      channelRef.current.onmessage = (event: MessageEvent<{ type: string; status?: Status }>) => {
        if (event.data.type === "status" && event.data.status) setStatus(event.data.status);
        if (event.data.type === "ended") finish();
      };
    } catch {
      channelRef.current = null;
    }
    const onInteraction = () => void ping();
    const onVisible = () => {
      if (document.visibilityState === "visible") void fetchStatus();
    };
    const events = ["pointerdown", "keydown", "touchstart", "wheel"] as const;
    for (const name of events) window.addEventListener(name, onInteraction, { passive: true });
    document.addEventListener("visibilitychange", onVisible);
    // Arriving on a page is the user being present.
    void ping(true);
    const poll = setInterval(() => void fetchStatus(), STATUS_POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    pingRef.current = ping;
    return () => {
      for (const name of events) window.removeEventListener(name, onInteraction);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(poll);
      clearInterval(tick);
      channelRef.current?.close();
    };
  }, []);

  // When a deadline passes, ask the server (another tab may have extended it); end if it is over.
  useEffect(() => {
    if (!status || endedRef.current) return;
    if (now < Math.min(status.idleExpiresAt, status.absoluteExpiresAt)) return;
    const controller = new AbortController();
    void fetch("/api/identity/session", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401) {
          if (!endedRef.current) {
            endedRef.current = true;
            endSession("expired");
          }
        } else if (response.ok) setStatus(parse(await response.json()));
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [now, status]);

  if (!status) return null;
  const idleLeft = status.idleExpiresAt - now;
  const absoluteLeft = status.absoluteExpiresAt - now;
  const idleWarning = status.deviceClass === "desktop" && idleLeft > 0 && idleLeft <= IDLE_WARNING_MS && status.idleExpiresAt < status.absoluteExpiresAt;
  const absoluteWarning = absoluteLeft > 0 && absoluteLeft <= ABSOLUTE_WARNING_MS;
  if (!idleWarning && !absoluteWarning) return null;

  const signInAgain = async () => {
    window.dispatchEvent(new Event(SESSION_ENDING_EVENT));
    await fetch("/api/auth/sign-out", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).catch(() => null);
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full reload is intended after sign-out
    window.location.assign("/login?reason=signed-out");
  };

  return (
    <div role="alertdialog" aria-labelledby="session-warning-title" aria-describedby="session-warning-text" className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-lg rounded-xl border border-brand/30 bg-surface p-4 shadow-lg">
      <p id="session-warning-title" className="font-semibold text-ink">
        {idleWarning ? "Are you still there?" : "Your session is ending soon"}
      </p>
      <p id="session-warning-text" className="mt-1 text-sm text-ink" aria-live="polite">
        {idleWarning
          ? `For your security you will be signed out in ${clock(idleLeft)} because there has been no activity.`
          : `Sessions on this device last at most ${status.deviceClass === "desktop" ? "12 hours" : "30 days"}. You will be signed out at ${timeOfDay.format(status.absoluteExpiresAt)}. Save your work, then sign in again.`}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {idleWarning ? (
          <Button type="button" onClick={() => void pingRef.current(true)}>
            Stay signed in
          </Button>
        ) : (
          <Button type="button" onClick={() => void signInAgain()}>
            Sign in again now
          </Button>
        )}
        <Button type="button" variant="secondary" onClick={() => void signInAgain()}>
          Sign out
        </Button>
      </div>
    </div>
  );
}

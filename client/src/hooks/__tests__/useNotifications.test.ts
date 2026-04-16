import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useNotifications } from "../useNotifications";
import { eventBus } from "../../lib/eventBus";
import type { WSMessage } from "../../lib/types";

const NOTIF_KEY = "agent-monitor-notifications";

const enabledPrefs = JSON.stringify({
  enabled: true,
  onNewSession: true,
  onSessionError: true,
  onSessionComplete: true,
  onSubagentSpawn: true,
});

function makeSessionCreatedMsg(): WSMessage {
  return {
    type: "session_created",
    data: {
      id: "abc12345",
      name: "Test Session",
      status: "active",
      cwd: null,
      model: null,
      started_at: new Date().toISOString(),
      ended_at: null,
      metadata: null,
    },
    timestamp: new Date().toISOString(),
  };
}

describe("useNotifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("localStorage", {
      _store: {} as Record<string, string>,
      getItem(key: string) { return this._store[key] ?? null; },
      setItem(key: string, value: string) { this._store[key] = value; },
      removeItem(key: string) { delete this._store[key]; },
      clear() { this._store = {}; },
    });

    localStorage.setItem(NOTIF_KEY, enabledPrefs);

    Object.defineProperty(window, "Notification", {
      value: class {
        static permission = "granted";
        static requestPermission = vi.fn().mockResolvedValue("granted");
        constructor() {}
      },
      writable: true,
      configurable: true,
    });

    // Mock fetch globally
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));

    // Mock serviceWorker so subscribeToPush short-circuits (no PushManager)
    Object.defineProperty(navigator, "serviceWorker", {
      value: { ready: Promise.resolve({ pushManager: { getSubscription: vi.fn().mockResolvedValue(null) } }) },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, "PushManager", {
      value: undefined,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls POST /api/push/send when a session is created", async () => {
    renderHook(() => useNotifications());

    await act(async () => {
      eventBus.publish(makeSessionCreatedMsg());
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/push/send",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("New Session"),
      })
    );
  });

  it("does not call fetch when notifications are disabled", async () => {
    localStorage.setItem(NOTIF_KEY, JSON.stringify({ enabled: false }));

    renderHook(() => useNotifications());

    await act(async () => {
      eventBus.publish(makeSessionCreatedMsg());
      await Promise.resolve();
    });

    const pushCalls = vi.mocked(fetch).mock.calls.filter(
      ([url]) => url === "/api/push/send"
    );
    expect(pushCalls).toHaveLength(0);
  });
});

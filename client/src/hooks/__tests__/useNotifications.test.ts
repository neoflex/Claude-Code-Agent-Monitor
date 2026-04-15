import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useNotifications } from "../useNotifications";
import { eventBus } from "../../lib/eventBus";
import type { WSMessage } from "../../lib/types";

const NOTIF_KEY = "agent-monitor-notifications";

// Node 25 has a built-in localStorage that only works with --localstorage-file flag.
// We stub it here so tests work regardless of the node version.
const localStorageStore: Record<string, string> = {};
const localStorageMock = {
  setItem: (key: string, value: string) => { localStorageStore[key] = value; },
  getItem: (key: string) => localStorageStore[key] ?? null,
  removeItem: (key: string) => { delete localStorageStore[key]; },
  clear: () => { Object.keys(localStorageStore).forEach(k => delete localStorageStore[k]); },
};
vi.stubGlobal("localStorage", localStorageMock);

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
  const mockShowNotification = vi.fn();
  const mockRegistration = { showNotification: mockShowNotification };

  beforeEach(() => {
    vi.clearAllMocks();
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

    Object.defineProperty(navigator, "serviceWorker", {
      value: { ready: Promise.resolve(mockRegistration) },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    localStorage.removeItem(NOTIF_KEY);
  });

  it("calls showNotification via service worker when a session is created", async () => {
    renderHook(() => useNotifications());

    await act(async () => {
      eventBus.publish(makeSessionCreatedMsg());
      // flush the async notify() promise
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockShowNotification).toHaveBeenCalledWith(
      "New Session",
      expect.objectContaining({ body: "Test Session" })
    );
  });

  it("falls back to new Notification() when serviceWorker is unavailable", async () => {
    const NotificationConstructor = vi.fn();
    Object.defineProperty(window, "Notification", {
      value: Object.assign(NotificationConstructor, { permission: "granted" }),
      writable: true,
      configurable: true,
    });
    Object.defineProperty(navigator, "serviceWorker", {
      value: undefined,
      writable: true,
      configurable: true,
    });

    renderHook(() => useNotifications());

    await act(async () => {
      eventBus.publish(makeSessionCreatedMsg());
      await Promise.resolve();
    });

    expect(NotificationConstructor).toHaveBeenCalledWith(
      "New Session",
      expect.objectContaining({ body: "Test Session" })
    );
  });
});

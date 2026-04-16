import { useEffect } from "react";
import { eventBus } from "../lib/eventBus";
import { subscribeToPush } from "../lib/push";
import type { WSMessage, Session, Agent, DashboardEvent } from "../lib/types";

const NOTIF_KEY = "agent-monitor-notifications";

interface NotifPrefs {
  enabled: boolean;
  onNewSession: boolean;
  onSessionError: boolean;
  onSessionComplete: boolean;
  onSubagentSpawn: boolean;
}

const DEFAULT_PREFS: NotifPrefs = {
  enabled: false,
  onNewSession: true,
  onSessionError: true,
  onSessionComplete: false,
  onSubagentSpawn: false,
};

function loadPrefs(): NotifPrefs {
  try {
    const raw = localStorage.getItem(NOTIF_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

async function notify(title: string, body: string) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    await fetch("/api/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body }),
    });
  } catch {
    // Server unreachable — fall back to local notification
    try {
      if ("serviceWorker" in navigator) {
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification(title, { body, icon: "/favicon.ico" });
      } else {
        new Notification(title, { body, icon: "/favicon.ico" });
      }
    } catch {
      // Silently ignore
    }
  }
}

/**
 * Subscribe to the event bus and fire browser notifications based on user preferences.
 * Call once at the app root level.
 */
export function useNotifications() {
  useEffect(() => {
    const prefs = loadPrefs();
    if (prefs.enabled && "Notification" in window && Notification.permission === "granted") {
      subscribeToPush().catch(() => {});
    }

    return eventBus.subscribe((msg: WSMessage) => {
      const currentPrefs = loadPrefs();
      if (!currentPrefs.enabled) return;

      switch (msg.type) {
        case "session_created": {
          if (!currentPrefs.onNewSession) return;
          const session = msg.data as Session;
          notify("New Session", session.name || `Session ${session.id.slice(0, 8)}`);
          break;
        }
        case "session_updated": {
          const session = msg.data as Session;
          if (session.status === "error" && currentPrefs.onSessionError) {
            notify("Session Error", session.name || `Session ${session.id.slice(0, 8)}`);
          }
          break;
        }
        case "agent_created": {
          if (!currentPrefs.onSubagentSpawn) return;
          const agent = msg.data as Agent;
          if (agent.type === "subagent") {
            notify("Subagent Spawned", agent.name);
          }
          break;
        }
        case "new_event": {
          const dashboardEvent = msg.data as DashboardEvent;
          if (dashboardEvent.event_type === "Stop" && currentPrefs.onSessionComplete) {
            notify("Claude Finished Responding", dashboardEvent.summary || "Ready for input");
          } else if (dashboardEvent.event_type === "SessionEnd" && currentPrefs.onSessionComplete) {
            notify("Session Completed", dashboardEvent.summary || "Session closed");
          } else if (dashboardEvent.event_type === "Notification") {
            notify("Claude Code", dashboardEvent.summary || "Notification");
          }
          break;
        }
      }
    });
  }, []);
}

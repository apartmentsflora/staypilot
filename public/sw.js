// StayPilot Service Worker — handles push notifications on lock screen
// This runs in the background even when the browser tab is closed.

self.addEventListener("install", (e) => {
  self.skipWaiting(); // activate immediately
});

self.addEventListener("activate", (e) => {
  e.waitUntil(self.clients.claim()); // take control of all pages
});

// ── Push event — fired by the server via Web Push ──────────────────────────
self.addEventListener("push", (e) => {
  if (!e.data) return;

  let payload;
  try {
    payload = e.data.json();
  } catch {
    payload = { title: "StayPilot", body: e.data.text() };
  }

  const isAlert = payload.type === "ALERT";

  const options = {
    body: payload.body || "",
    icon: "/icon-192.png",
    badge: "/icon-badge-72.png",
    tag: payload.tag || (isAlert ? `alert-${Date.now()}` : `notif-${Date.now()}`),
    data: { url: payload.url || "/dashboard/calendar", type: payload.type },
    // ALERT notifications stay on screen until dismissed (lock screen persistent)
    requireInteraction: isAlert,
    // Vibration pattern: ALERTs get an urgent triple-buzz, normal gets a single buzz
    vibrate: isAlert ? [200, 100, 200, 100, 200] : [200],
    // Renotify allows replacing same-tag notification with a new buzz
    renotify: true,
  };

  // Add actions for ALERT notifications (Android shows these as buttons)
  if (isAlert) {
    options.actions = [
      { action: "open", title: "Open" },
      { action: "dismiss", title: "OK" },
    ];
  }

  const title = payload.title || (isAlert ? "StayPilot Alert" : "StayPilot");

  e.waitUntil(self.registration.showNotification(title, options));
});

// ── Notification click — open/focus the calendar page ──────────────────────
self.addEventListener("notificationclick", (e) => {
  e.notification.close();

  if (e.action === "dismiss") return; // just close

  const url = (e.notification.data && e.notification.data.url) || "/dashboard/calendar";

  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // If a StayPilot tab is already open, navigate it and focus
      for (const client of clients) {
        if (client.url.includes("/dashboard") && "focus" in client) {
          if ("navigate" in client) {
            return client.navigate(url).then(() => client.focus()).catch(() => self.clients.openWindow(url));
          }
          return client.focus();
        }
      }
      // Otherwise open a new tab
      return self.clients.openWindow(url);
    })
  );
});

self.addEventListener("push", (event) => {
  const data = event.data
    ? event.data.json()
    : { title: "Agent Monitor", body: "New notification" };
  const { title, ...options } = data;
  event.waitUntil(self.registration.showNotification(title, { silent: false, ...options }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window" }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.focus) {
          return client.focus();
        }
      }
    })
  );
});

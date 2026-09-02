const CACHE_NAME = "altar-v1";
const urlsToCache = ["/", "/icon/icon-192.png", "/icon/icon-512.png"];

// Install event - cache core assets
//
// NAO chama skipWaiting aqui, de proposito.
//
// Com skipWaiting o service worker NOVO assume no mesmo instante, enquanto a
// aba continua rodando o JavaScript ANTIGO. As telas do ALTAR chegam sob
// demanda: a pagina velha pede um pedaco com nome antigo, o worker novo vai
// buscar na rede, e esse arquivo ja nao existe mais no servidor. Resultado:
// tela que nao abre, no meio de uma montagem.
//
// Esperando, o worker novo fica em `waiting` ate a pessoa aceitar o aviso
// "Nova versao disponivel" — e ai a pagina recarrega inteira, coerente consigo
// mesma. Enquanto ela nao aceita, tudo continua servido pela versao antiga,
// que e a que a aba esta rodando.
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache)));
});

// A troca acontece quando a PESSOA aceita, nunca no meio do uso.
// Quem envia esta mensagem e o aviso de atualizacao (src/hooks/use-service-worker.ts).
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "ATIVAR_NOVA_VERSAO") {
    self.skipWaiting();
  }
});

// Fetch event - network first, fall back to cache
self.addEventListener("fetch", (event) => {
  // Only handle GET requests - POST/PUT/DELETE cannot be cached
  if (event.request.method !== "GET") {
    return;
  }

  // Never intercept cross-origin requests.
  let url;
  try {
    url = new URL(event.request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) {
    return;
  }

  // Never intercept auth paths.
  if (url.pathname.startsWith("/auth")) {
    return;
  }

  // Handle navigation requests differently
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.match("/")));
    return;
  }

  // Network-first for other same-origin GET requests
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Only cache successful responses (status 200-299)
        if (!response.ok) {
          return response;
        }
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
        return response;
      })
      .catch(() => caches.match(event.request)),
  );
});

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              return caches.delete(cacheName);
            }
          }),
        );
      })
      .then(() => self.clients.claim()),
  );
});

// Handle push notifications - only show if app is not in focus
self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      const isAppInFocus = clientList.some((client) => client.focused);

      // Only show notification if app is not in focus
      if (!isAppInFocus) {
        return self.registration.showNotification(data.title, data.options);
      }
    }),
  );
});

// Handle notification clicks - opens/focuses the app
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: "window" }).then((clientList) => {
      // Focus existing window if found
      for (const client of clientList) {
        if ("focus" in client) return client.focus();
      }
      // Open new window if none exists
      if (clients.openWindow) return clients.openWindow("/");
    }),
  );
});

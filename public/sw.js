// Cantine Pro — service worker de la PWA salarié (/p/[token])
// - pages /p/... : réseau d'abord, dernière version gardée pour s'ouvrir sans réseau
// - fichiers /_next/static (noms versionnés) et icônes : cache d'abord
const CACHE = "cantine-pro-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cles) => Promise.all(cles.filter((c) => c !== CACHE).map((c) => caches.delete(c))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate" && url.pathname.startsWith("/p/")) {
    event.respondWith(
      fetch(request)
        .then((reponse) => {
          if (reponse.ok) {
            const copie = reponse.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copie));
          }
          return reponse;
        })
        .catch(() =>
          caches
            .match(request)
            .then((cache) => cache || new Response("Hors connexion : réessayez dès le retour du réseau.", {
              status: 503,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            }))
        )
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icon") || url.pathname === "/apple-touch-icon.png") {
    event.respondWith(
      caches.match(request).then(
        (cache) =>
          cache ||
          fetch(request).then((reponse) => {
            if (reponse.ok) {
              const copie = reponse.clone();
              caches.open(CACHE).then((c) => c.put(request, copie));
            }
            return reponse;
          })
      )
    );
  }
});

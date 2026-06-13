/* Songbook service worker — caches the app shell so the PWA boots
 * offline. Song content lives in IndexedDB (synced by the app), so the
 * SW only needs to serve HTML/JS/CSS when there's no network.
 */
const VERSION = "v1";
const SHELL_CACHE = `songbook-shell-${VERSION}`;
const RUNTIME_CACHE = `songbook-runtime-${VERSION}`;

/* /songs/__shell__ renders the same client-side shell as any real song
 * URL (the page reads its slug from location), so one cached copy
 * serves every song offline — even songs never opened online. */
const SHELL_URLS = ["/", "/songs/__shell__", "/songs/__shell__/edit"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await Promise.allSettled(
        SHELL_URLS.map(async (url) => {
          const res = await fetch(url, { credentials: "same-origin" });
          if (res.ok) await cache.put(url, res);
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => n !== SHELL_CACHE && n !== RUNTIME_CACHE)
          .map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

function shellFor(pathname) {
  if (/^\/songs\/[^/]+\/edit\/?$/.test(pathname)) return "/songs/__shell__/edit";
  if (/^\/songs\/[^/]+\/?$/.test(pathname)) return "/songs/__shell__";
  return "/";
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Never cache API or auth traffic.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/"))
    return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(request);
          if (res.ok) {
            const cache = await caches.open(SHELL_CACHE);
            cache.put(shellFor(url.pathname), res.clone());
          }
          return res;
        } catch {
          const cache = await caches.open(SHELL_CACHE);
          return (
            (await cache.match(url.pathname, { ignoreVary: true })) ||
            (await cache.match(shellFor(url.pathname), { ignoreVary: true })) ||
            (await cache.match("/", { ignoreVary: true })) ||
            Response.error()
          );
        }
      })(),
    );
    return;
  }

  // Static assets and RSC payloads: stale-while-revalidate.
  event.respondWith(
    (async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      const cached = await cache.match(request);
      const network = fetch(request)
        .then((res) => {
          if (res.ok) cache.put(request, res.clone());
          return res;
        })
        .catch(() => undefined);
      return cached || (await network) || Response.error();
    })(),
  );
});

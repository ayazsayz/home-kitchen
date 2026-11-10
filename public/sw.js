// Service worker.
// Customers: makes the app installable and shows a friendly page when offline (menu and orders always come live).
// Staff (/admin): keeps the last copy of the Orders and New order screens, so they still open without internet;
// orders taken offline are saved on the device and uploaded by the page when the connection is back.
const OFFLINE = "/offline.html";
const BASE = "hk-v1";
const PAGES = "hk-admin-pages-v1";
const STATIC = "hk-static-v1";
const DEV = new URL(self.location.href).searchParams.has("dev"); // dev server: no caching of scripts
const NO_CACHE = ["/admin/login", "/admin/no-access"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(BASE).then((c) => c.add(OFFLINE)));
  self.skipWaiting();
});
self.addEventListener("activate", (e) =>
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => ![BASE, PAGES, STATIC].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  ),
);

const isAdminPage = (path) => path.startsWith("/admin") && !NO_CACHE.includes(path);
const signedOut = (res) => new URL(res.url).pathname === "/admin/login";

async function savePage(path, res) {
  if (!res.ok || res.type !== "basic") return;
  if (signedOut(res)) return caches.delete(PAGES); // signed out → forget staff screens
  if (res.redirected) return;
  const c = await caches.open(PAGES);
  await c.put(path, res);
}

/** Scripts and styles a page needs (hashed file names never change, so they can be kept). */
async function saveAssets(html) {
  if (DEV) return;
  const urls = [...new Set(html.match(/\/_next\/static\/[^"'\s)\\]+/g) || [])];
  const c = await caches.open(STATIC);
  await Promise.all(
    urls.map(async (u) => {
      if (await c.match(u)) return;
      try {
        const r = await fetch(u);
        if (r.ok) await c.put(u, r);
      } catch {}
    }),
  );
}

self.addEventListener("message", (e) => {
  if (e.data?.type !== "warm") return;
  e.waitUntil(
    (async () => {
      const c = await caches.open(STATIC);
      if ((await c.keys()).length > 400) await caches.delete(STATIC); // old app versions pile up — start fresh
      for (const path of e.data.paths || []) {
        if (!isAdminPage(path)) continue;
        try {
          const res = await fetch(path, { credentials: "same-origin", cache: "no-store" });
          const html = await res.clone().text();
          await savePage(path, res);
          if (res.ok && !res.redirected) await saveAssets(html);
        } catch {}
      }
    })(),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Hashed scripts/styles: from the cache when we have them.
  if (!DEV && url.pathname.startsWith("/_next/static/")) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  if (req.mode !== "navigate") return;

  // Staff screens: always live when online; last saved copy when offline.
  if (isAdminPage(url.pathname)) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          e.waitUntil(savePage(url.pathname, copy));
          return res;
        })
        .catch(async () => (await caches.match(url.pathname, { cacheName: PAGES })) || caches.match(OFFLINE)),
    );
    return;
  }
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (url.pathname === "/admin/login") e.waitUntil(caches.delete(PAGES)); // signed out → forget staff screens
        return res;
      })
      .catch(() => caches.match(OFFLINE)),
  );
});

/* Nexus B2B service worker – V1 foundation.
 * - Precaches the offline shell
 * - Network-first for navigations (falls back to cache, then /offline.html)
 * - Stale-while-revalidate for static assets & product images
 * Future: background sync of the Pending Sync order queue + Web Push.
 */
const VERSION = 'nexus-v3';
const API_CACHE = 'nexus-api-catalogue-v1';
// the signed-in user's own customer records are kept too (cleared on sign-out) so an order can be built offline
const CATALOGUE_API = /\/(products(\/[^/]+)?|offers(\/[^/]+)?|customers(\/[^/]+)?|sites|access\/role-modules|settings\/workflow)$/;
const SHELL = ['/offline.html', '/manifest.webmanifest', '/icons/icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== API_CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); return res; })
      .catch(() => caches.match(req).then((r) => r || caches.match('/offline.html'))));
    return;
  }
  // Live API: only the catalogue (items, list prices, stock, offers), the user's customers and the menu rules are kept, so a
  // rep or buyer can still browse and build an order offline. Network first; the cached copy is used only
  // when the network fails. Orders, invoices, payments and account balances are never cached.
  if (req.headers.get('Authorization') && CATALOGUE_API.test(url.pathname)) {
    const key = `${url.href}#site=${req.headers.get('X-Site') || ''}`;
    e.respondWith(fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(API_CACHE).then((c) => c.put(key, copy)); } return res; })
      .catch(() => caches.open(API_CACHE).then((c) => c.match(key)).then((r) => r || Response.error())));
    return;
  }
  // Non-sensitive static files only: app code, icons, product images, branding settings and translation overrides.
  if (url.pathname.startsWith('/_next/static') || url.hostname === 'images.unsplash.com' || url.pathname.startsWith('/icons') || url.pathname.startsWith('/i18n/') || url.pathname === '/config/settings.json') {
    e.respondWith(caches.open(VERSION).then((c) => c.match(req).then((hit) => {
      const net = fetch(req).then((res) => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    })));
  }
});
self.addEventListener('push', (e) => {
  const data = e.data ? e.data.json() : { title: 'Nexus B2B', body: 'You have a new update' };
  e.waitUntil(self.registration.showNotification(data.title, { body: data.body, icon: '/icons/icon.svg', data: data.url }));
});
self.addEventListener('notificationclick', (e) => { e.notification.close(); e.waitUntil(self.clients.openWindow(e.notification.data || '/notifications')); });

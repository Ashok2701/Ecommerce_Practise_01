/* Nexus B2B service worker – V1 foundation.
 * - Precaches the offline shell
 * - Network-first for navigations (falls back to cache, then /offline.html)
 * - Stale-while-revalidate for static assets & product images
 * Future: background sync of the Pending Sync order queue + Web Push.
 */
const VERSION = 'nexus-v1';
const SHELL = ['/offline.html', '/manifest.webmanifest', '/icons/icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
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
  if (url.pathname.startsWith('/_next/static') || url.hostname === 'images.unsplash.com' || url.pathname.startsWith('/icons')) {
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

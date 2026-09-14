const CACHE_NAME = 'cps-public-shell-v177';
const OWN_CACHE_PREFIXES = ['cps-public-shell-', 'cps-kurulum-'];
const OFFLINE_PAGE = './offline.html';

// Yalnızca uygulama kabuğu ve herkese açık statik bileşenler.
// Müşteri, kontak, kullanıcı ve ürün dizinleri bu listede bulunmamalıdır.
const PUBLIC_SHELL_ASSETS = [
  './index.html',
  OFFLINE_PAGE,
  './styles.css?v=176',
  './app.js?v=168',
  './js/planning-calendar.js?v=165',
  './js/customer-list.js?v=165',
  './js/dashboard.js?v=165',
  './js/installation-workflows.js?v=168',
  './js/service-reports.js?v=166',
  './js/service-workflows.js?v=168',
  './js/customers.js?v=165',
  './js/app-events.js?v=170',
  './js/operation-policy.js?v=165',
  './js/reports.js?v=168',
  './js/organization.js?v=165',
  './js/sales-changes.js?v=169',
  './js/goodwill.js?v=165',
  './word-report-docx.js?v=96',
  './manifest.webmanifest',
  './assets/icons/cps-180.png',
  './assets/icons/cps-192.png',
  './assets/icons/cps-512.png',
  './assets/icons/cps-maskable-512.png',
  './assets/desoutter-logo.webp',
  './vendor/xlsx.full.min.js',
  './vendor/pdf-lib.min.js',
  './vendor/fontkit.umd.min.js',
  './vendor/docx.iife.js'
];

const scope = new URL(self.registration.scope);
const publicUrls = new Set(PUBLIC_SHELL_ASSETS.map(asset => new URL(asset, scope).href));
const privateDataPath = new URL('./demodata/', scope).pathname;
const apiPath = new URL('./api/', scope).pathname;
const offlineUrl = new URL(OFFLINE_PAGE, scope).href;
const appPagePaths = new Set([scope.pathname, new URL('./index.html', scope).pathname, new URL(OFFLINE_PAGE, scope).pathname]);

async function cachePublicAsset(cache, asset) {
  const url = new URL(asset, scope).href;
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok || response.type === 'opaque') return false;
    await cache.put(url, response);
    return true;
  } catch {
    // Tek bir eksik/başarısız dosya diğerlerinin önbelleğe alınmasını durdurmaz.
    return false;
  }
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Çevrimdışı açıklama sayfası olmadan yeni çalışanı etkinleştirmeyin.
    if (!await cachePublicAsset(cache, OFFLINE_PAGE)) throw new Error('Çevrimdışı sayfası önbelleğe alınamadı.');
    await Promise.all(PUBLIC_SHELL_ASSETS.filter(asset => asset !== OFFLINE_PAGE).map(asset => cachePublicAsset(cache, asset)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key !== CACHE_NAME && OWN_CACHE_PREFIXES.some(prefix => key.startsWith(prefix))).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== scope.origin) return;

  // Hassas dizinler ve gelecekteki API yanıtları Cache Storage'a girmez.
  if (url.pathname.startsWith(privateDataPath) || url.pathname.startsWith(apiPath) || url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request, { cache: 'no-store' }));
    return;
  }
  if (!url.pathname.startsWith(scope.pathname)) return;

  if (request.mode === 'navigate') {
    // Aynı sunucudaki başka sayfaların çevrimdışı davranışını değiştirmeyin.
    if (!appPagePaths.has(url.pathname)) return;
    event.respondWith((async () => {
      try {
        return await fetch(request);
      } catch {
        return await (await caches.open(CACHE_NAME)).match(offlineUrl) || Response.error();
      }
    })());
    return;
  }

  // Bilinmeyen dosyaları otomatik önbelleğe alma; HTML'i betik/görsel yerine döndürme.
  if (!publicUrls.has(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(request);
      if (response.ok && response.type !== 'opaque') {
        event.waitUntil(cache.put(request, response.clone()).catch(() => {}));
      }
      return response;
    } catch {
      return await cache.match(request) || Response.error();
    }
  })());
});

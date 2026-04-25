// キャッシュの名前
const CACHE_NAME = 'pad-maker-cache-v1';

// インストール時の処理
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

// アクティベート時の処理
self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

// ネットワークリクエストの処理（とりあえずそのまま通信を通す）
self.addEventListener('fetch', (event) => {
    event.respondWith(fetch(event.request));
});
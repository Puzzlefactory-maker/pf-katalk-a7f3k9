/* 단서 메신저 서비스워커
   - 등록 주소가 ./sw.js?v=DATA_VERSION 이므로 파일이 새로 배포되면 캐시 이름이 바뀐다.
   - 새 캐시가 활성화되는 순간 이전 버전 캐시는 전부 삭제된다.
   - html/manifest 는 항상 네트워크 먼저(=최신 파일 우선), 실패하면 캐시로 열린다. */

const VER = (function(){
  try { return new URL(self.location.href).searchParams.get('v') || 'dev'; }
  catch(e){ return 'dev'; }
})();
const PREFIX = 'crimescene-kakao-';
const CACHE = PREFIX + VER;
/* 같은 주소(github.io 등)에 다른 단서 앱이 함께 올라가 있을 수 있으므로
   이 앱의 캐시만 골라낸다. 예전 이름(crimescene-<버전>)도 이 앱 것으로 본다. */
function isMine(k){
  if (k.indexOf(PREFIX) === 0) return true;
  if (k.indexOf('crimescene-') !== 0) return false;
  return k.indexOf('crimescene-insta-') !== 0;
}
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then(cache =>
      Promise.all(ASSETS.map(u => cache.add(u).catch(() => {})))
    )
  );
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => isMine(k) && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;

  /* 새 파일 확인용 요청(_uc)과 파일 만들기용 요청(_ex)은 서비스워커가 손대지 않는다.
     캐시를 거치지 않고 서버의 실제 파일을 그대로 읽어야 하기 때문이다. */
  if (url.searchParams.has('_uc') || url.searchParams.has('_ex')) return;

  const isDoc = req.mode === 'navigate'
    || url.pathname.endsWith('/')
    || url.pathname.endsWith('.html')
    || url.pathname.endsWith('.webmanifest');

  if (isDoc) {
    event.respondWith((async () => {
      try {
        /* 이동(navigate) 요청은 Request 를 그대로 재사용하면 브라우저마다 제약이 있어,
           주소에 시간값을 붙여 새로 요청한다. 이러면 브라우저 캐시도 확실히 건너뛴다. */
        const bust = new URL(url.href);
        bust.searchParams.set('_sw', Date.now().toString(36));
        const fresh = await fetch(bust.href, { cache: 'no-store', credentials: 'same-origin' });
        if (!fresh || !fresh.ok) throw new Error('bad response');
        try {
          const cache = await caches.open(CACHE);
          await cache.put(new Request(url.href), fresh.clone());
        } catch (e) { }
        return fresh;
      } catch (e) {
        const hit = await caches.match(url.href, { ignoreSearch: true });
        return hit || (await caches.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const fresh = await fetch(req);
      const cache = await caches.open(CACHE);
      cache.put(req, fresh.clone());
      return fresh;
    } catch (e) {
      return Response.error();
    }
  })());
});

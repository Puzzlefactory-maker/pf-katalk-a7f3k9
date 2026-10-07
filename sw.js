/* 단서 메신저 서비스워커 — 구형 폰에서도 읽히도록 ES5 문법만 쓴다.

   예전 파일은 async/await 와 화살표 함수를 써서, 크롬 55 미만(갤럭시 노트4·S6 에 들어
   있는 브라우저)에서는 이 파일 자체가 읽히지 않았다. 그러면 서비스워커가 설치되지 않아
   캐시가 비고, 와이파이가 없을 때 앱이 열리지 않는다.

   캐시는 이 앱 것(앞머리가 같은 것)만 지운다. 같은 주소에 다른 단서 앱이 함께 올라가
   있어도 서로의 캐시를 지우지 않는다. */

var PREFIX = 'crimescene-kakao-';
var VER = (function () {
  try {
    var m = String(self.location.search || '').match(/[?&]v=([^&]*)/);
    return m ? decodeURIComponent(m[1]) : 'dev';
  } catch (e) { return 'dev'; }
})();
var CACHE = PREFIX + VER;
var ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

function isMine(k) { return k.indexOf(PREFIX) === 0; }

self.addEventListener('install', function (event) {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      var jobs = [];
      for (var i = 0; i < ASSETS.length; i++) {
        jobs.push(cache.add(ASSETS[i])['catch'](function () {}));
      }
      return Promise.all(jobs);
    })['catch'](function () {})
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      var jobs = [];
      for (var i = 0; i < keys.length; i++) {
        if (isMine(keys[i]) && keys[i] !== CACHE) jobs.push(caches['delete'](keys[i]));
      }
      return Promise.all(jobs);
    })['catch'](function () {}).then(function () {
      return self.clients.claim();
    })
  );
});

/* 화면(문서) 요청인지 */
function isDocReq(req, path) {
  if (req.mode === 'navigate') return true;
  if (path.charAt(path.length - 1) === '/') return true;
  return /\.(html|webmanifest)$/.test(path);
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var href = req.url;
  if (href.indexOf(self.location.origin) !== 0) return;   /* 다른 주소는 손대지 않는다 */

  /* 새 파일 확인(_uc)·파일 만들기(_ex) 요청은 서버 파일을 그대로 읽어야 하므로 지나간다 */
  if (href.indexOf('_uc=') >= 0 || href.indexOf('_ex=') >= 0) return;

  var path = href.split('#')[0].split('?')[0];

  if (isDocReq(req, path)) {
    /* 화면은 서버 먼저, 안 되면 캐시 — 오프라인이면 바로 캐시로 열린다 */
    event.respondWith(
      fetch(path + '?_sw=' + Date.now().toString(36), { cache: 'no-store', credentials: 'same-origin' })
        .then(function (fresh) {
          if (!fresh || !fresh.ok) throw new Error('bad response');
          var copy = fresh.clone();
          caches.open(CACHE).then(function (cache) {
            cache.put(new Request(path), copy);
          })['catch'](function () {});
          return fresh;
        })['catch'](function () {
          return caches.match(path, { ignoreSearch: true }).then(function (hit) {
            if (hit) return hit;
            return caches.match('./index.html').then(function (h2) {
              return h2 || Response.error();
            });
          });
        })
    );
    return;
  }

  /* 그림·아이콘 등은 캐시 먼저 */
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (fresh) {
        var copy = fresh.clone();
        caches.open(CACHE).then(function (cache) {
          cache.put(req, copy);
        })['catch'](function () {});
        return fresh;
      })['catch'](function () { return Response.error(); });
    })
  );
});
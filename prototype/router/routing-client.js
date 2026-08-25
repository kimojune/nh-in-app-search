/* =========================================================================
   routing-client.js — 계열사 앱이 심는 전부
   -------------------------------------------------------------------------
   설계 원칙: 지능은 중앙(라우터)에 두고, 앱은 사전 조회만 한다.

   앱이 하지 않는 일
     - 동의어 판단, 표기 정규화 규칙 관리
     - 어느 채널이 담당인지에 대한 판단
     - 어떤 앱에서 안내를 숨길지에 대한 판단
   위 세 가지는 전부 라우터가 발행 시점에 끝내고 스냅샷에 담아 내려보낸다.

   앱이 하는 일
     1) sync()   하루 1회. 조건부 요청이라 변경이 없으면 본문 0 B
     2) lookup() 검색할 때마다. 네트워크 호출 없음. 해시 조회 1회
   ========================================================================= */
(function (global) {
  "use strict";

  var KEY_SNAPSHOT = "routing:snapshot";
  var KEY_ETAG     = "routing:etag";
  var KEY_SYNCED   = "routing:syncedAt";

  /* 조회를 받아줄 검색어 길이의 상한.
     정규화는 글자 수에 비례하므로 아주 긴 입력(문서 붙여넣기 등)이 그대로 들어오면
     그만큼 시간이 든다. 계열사 앱의 입력창은 이 코드가 통제할 수 없으므로 여기서 막는다.

     실제 등록된 표현은 samples/ 기준 가장 긴 것이 12자(정규화 후 10자)이고
     분리자가 낀 경우를 감안한 원문/정규화 비율도 최대 1.4배였다.
     256자는 그 20배가 넘는 여유이며, 이보다 긴 검색어는 등록된 표현과 일치할 수 없다. */
  var MAX_QUERY = 256;

  /* 라우터가 발행 시점에 쓰는 것과 같은 정규화.
     앱에 있는 유일한 "규칙"이며, 이 한 줄 외에는 판단이 없다. */
  function normalize(q) {
    return String(q == null ? "" : q).toLowerCase().replace(/[\s\-_.·]/g, "");
  }

  /* -------------------------------------------------------------------
     전송 계층
     실제 서비스에서는 http를 쓴다. 이 데모는 서버가 없으므로 local을 쓴다.
     sync()·lookup()의 로직은 둘 다 동일하고 바뀌는 건 이 계층뿐이다.
     ------------------------------------------------------------------- */
  var transports = {
    /* 프로덕션 형태 — CDN의 정적 스냅샷을 조건부 GET */
    http: function (url) {
      return function (etag) {
        return fetch(url, { headers: { "If-None-Match": etag || "" } })
          .then(function (res) {
            if (res.status === 304) return { status: 304 };
            return res.text().then(function (body) {
              return { status: 200, body: body, etag: res.headers.get("ETag") || "" };
            });
          });
      };
    },

    /* 데모 형태 — 콘솔이 발행한 스냅샷을 같은 origin에서 읽는다.
       ETag 비교와 304 응답을 그대로 재현한다. */
    local: function (channelKey) {
      return function (etag) {
        return new Promise(function (resolve) {
          var raw = global.localStorage.getItem(channelKey);
          if (!raw) { resolve({ status: 404 }); return; }
          var published = JSON.parse(raw);
          if (etag && etag === published.etag) { resolve({ status: 304 }); return; }
          resolve({ status: 200, body: JSON.stringify(published), etag: published.etag });
        });
      };
    }
  };

  /* -------------------------------------------------------------------
     클라이언트
     ------------------------------------------------------------------- */
  function RoutingClient(appId, fetcher) {
    this.appId = appId;
    this.fetch = fetcher;
    this._parsed = null;   // 펼쳐둔 스냅샷. sync()가 새 것을 받으면 버린다
  }

  /* 하루 1회 호출. 검색 경로에서는 절대 부르지 않는다. */
  RoutingClient.prototype.sync = function () {
    var self = this;
    /* 보내기 전에 들고 있는 캐시가 읽히는지 확인한다.
       못 읽으면 snapshot()이 etag를 버리므로, 아래에서 빈 etag로 요청해 전부 다시 받는다.
       이 확인이 없으면 조회를 한 번도 하지 않은 앱은 깨진 캐시를 하루 더 안고 간다. */
    self.snapshot();
    var etag = global.localStorage.getItem(KEY_ETAG) || "";

    return this.fetch(etag).then(function (res) {
      if (res.status === 304) {
        global.localStorage.setItem(KEY_SYNCED, String(Date.now()));
        return { status: 304, bytes: 0, changed: false, version: self.version() };
      }
      if (res.status !== 200) {
        return { status: res.status, bytes: 0, changed: false, version: null };
      }
      global.localStorage.setItem(KEY_SNAPSHOT, res.body);
      global.localStorage.setItem(KEY_ETAG, res.etag);
      global.localStorage.setItem(KEY_SYNCED, String(Date.now()));
      self._parsed = null;                                     // 내용이 바뀌었으니 다시 펼친다
      return {
        status: 200,
        bytes: byteLength(res.body),
        changed: true,
        version: self.version()
      };
    });
  };

  /* 검색할 때마다 호출. 네트워크 0. */
  RoutingClient.prototype.lookup = function (query) {
    /* 정규화 전에 길이부터 본다. 정규화는 글자 수에 비례하므로
       상한을 넘는 입력을 그대로 통과시키면 그만큼 시간이 든다.
       이 길이는 등록된 표현일 수 없으므로 조회해도 결과가 같다. */
    if (query != null && String(query).length > MAX_QUERY) return null;

    var snap = this.snapshot();
    if (!snap) return null;                                    // 스냅샷 없음 → 안내만 생략

    var id = snap.index[normalize(query)];
    if (!id) return null;                                      // 등록되지 않은 표현

    var fn = snap.functions[id];
    if (!fn) return null;

    if (fn.suppressIn && fn.suppressIn.indexOf(this.appId) !== -1) {
      return null;                                             // 중앙이 지정한 미노출
    }
    return fn;
  };

  /* 아래는 데모 화면이 상태를 보여주기 위한 부수 기능이다.
     앱이 안내를 띄우는 데 필요한 코드는 위의 sync()·lookup() 둘뿐이다. */

  /* 스냅샷은 저장소에 글자 한 줄로 들어 있어 그대로는 조회할 수 없다.
     펼치는 비용은 스냅샷 크기에 비례하므로 검색마다 반복하지 않고 한 번만 펼쳐 들고 있는다.
     이 캐시 덕분에 두 번째 조회부터는 스냅샷이 아무리 커져도 lookup()이 해시 조회 1회로 끝난다. */
  RoutingClient.prototype.snapshot = function () {
    if (this._parsed) return this._parsed;
    var raw = global.localStorage.getItem(KEY_SNAPSHOT);
    if (!raw) return null;
    try { this._parsed = JSON.parse(raw); }
    catch (e) {
      /* 손상된 스냅샷 → 안내만 생략한다. 다만 etag를 그대로 두면
         다음 동기화가 304를 받아 깨진 캐시를 계속 안고 간다.
         etag를 버려 다음 동기화가 전부 다시 받게 한다. */
      global.localStorage.removeItem(KEY_ETAG);
      return null;
    }
    return this._parsed;
  };

  RoutingClient.prototype.version = function () {
    var s = this.snapshot();
    return s ? s.version : null;
  };

  RoutingClient.prototype.status = function () {
    var s = this.snapshot();
    var raw = global.localStorage.getItem(KEY_SNAPSHOT);
    var synced = parseInt(global.localStorage.getItem(KEY_SYNCED) || "0", 10);
    return {
      hasCache: !!s,
      version: s ? s.version : null,
      publishedAt: s ? s.publishedAt : null,
      bytes: raw ? byteLength(raw) : 0,
      entries: s ? Object.keys(s.index).length : 0,
      functions: s ? Object.keys(s.functions).length : 0,
      syncedAt: synced || null,
      etag: global.localStorage.getItem(KEY_ETAG) || null
    };
  };

  /* 저장소가 이 클라이언트 밖에서 바뀐 경우(다른 탭의 발행, 손상)에 펼쳐둔 사본을 버린다.
     다음 조회에서 저장소를 다시 읽는다. 저장소 자체는 건드리지 않는다. */
  RoutingClient.prototype.refresh = function () {
    this._parsed = null;
  };

  RoutingClient.prototype.clearCache = function () {
    this._parsed = null;
    global.localStorage.removeItem(KEY_SNAPSHOT);
    global.localStorage.removeItem(KEY_ETAG);
    global.localStorage.removeItem(KEY_SYNCED);
  };

  function byteLength(s) {
    if (global.TextEncoder) return new TextEncoder().encode(s).length;
    return unescape(encodeURIComponent(s)).length;
  }

  global.RoutingClient = RoutingClient;
  global.RoutingClient.transports = transports;
  global.RoutingClient.normalize = normalize;
  global.RoutingClient.MAX_QUERY = MAX_QUERY;
  global.RoutingClient.KEYS = {
    SNAPSHOT: KEY_SNAPSHOT,
    ETAG: KEY_ETAG,
    SYNCED: KEY_SYNCED
  };
})(window);

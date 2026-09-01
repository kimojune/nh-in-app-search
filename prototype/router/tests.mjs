/* =========================================================================
   tests.mjs — routing-client.js 자동 검사

   실행:  node tests.mjs        (외부 라이브러리 없음)

   검사 대상은 화면이 아니라 계열사 앱이 실제로 심는 코드다.
     routing-client.js  라우터에서 기준을 받아 조회하는 부분
     app-themes.js      받은 데이터를 그 앱의 디자인으로 그리는 부분
   브라우저 전역(window·localStorage)은 이 파일 안에서 최소한으로 흉내낸다.
   ========================================================================= */
import fs from "node:fs";

/* ---------- 브라우저 흉내 ---------- */
function makeWindow() {
  const store = new Map();
  return {
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k)
    },
    TextEncoder,
    __store: store
  };
}

const source = fs.readFileSync(new URL("./routing-client.js", import.meta.url), "utf8");
function load(win) {
  new Function("window", source)(win);
  return win.RoutingClient;
}

/* ---------- 검사 도구 ---------- */
let pass = 0, fail = 0, section = "";
const failures = [];
function group(name) { section = name; console.log("\n" + name); }
function check(name, actual, expected) {
  const good = JSON.stringify(actual) === JSON.stringify(expected);
  if (good) { pass++; console.log("  통과  " + name); }
  else {
    fail++; failures.push(section + " / " + name);
    console.log("  실패  " + name);
    console.log("        기대: " + JSON.stringify(expected));
    console.log("        실제: " + JSON.stringify(actual));
  }
}
function ok(name, cond) { check(name, !!cond, true); }

/* ---------- 표본 스냅샷 ---------- */
const PUBLISHED_KEY = "routing:published";

function snapshot(version, etag) {
  return {
    version,
    publishedAt: "2026-08-25T00:00:00.000Z",
    tenant: "nh-financial",
    etag,
    index: {
      "k패스카드": "f-001",
      "케이패스": "f-001",
      "경기패스카드": "f-001",
      "조합원배당조회": "f-002"
    },
    functions: {
      "f-001": {
        name: "교통비 환급 카드 신청",
        next: "카드 목록에서 K-패스카드를 찾아 신청",
        suppressIn: ["nhpay"],
        channels: [
          { id: "nhpay", name: "NH Pay", role: "완료" },
          { id: "allone", name: "NH올원뱅크", role: "안내" }
        ]
      },
      "f-002": {
        name: "조합원 배당 조회",
        next: "콕뱅크에서 조회",
        suppressIn: [],
        channels: []
      }
    }
  };
}

function publish(win, snap) {
  win.localStorage.setItem(PUBLISHED_KEY, JSON.stringify(snap));
}

function fresh(appId = "allone") {
  const win = makeWindow();
  const RC = load(win);
  return { win, RC, client: new RC(appId, RC.transports.local(PUBLISHED_KEY)) };
}

/* =========================================================================
   1. 정규화 — 앱에 남은 유일한 규칙
   ========================================================================= */
{
  group("1. 정규화");
  const { RC } = fresh();
  const n = RC.normalize;
  check("공백을 지운다", n("K 패스 카드"), "k패스카드");
  check("하이픈을 지운다", n("K-패스카드"), "k패스카드");
  check("언더스코어와 가운뎃점을 지운다", n("K_패스·카드"), "k패스카드");
  check("대문자를 소문자로 맞춘다", n("KPASS"), "kpass");
  check("빈 값에도 예외를 내지 않는다", [n(null), n(undefined), n("")], ["", "", ""]);
}

/* =========================================================================
   2. 동기화
   ========================================================================= */
{
  group("2. 동기화");
  const { win, client } = fresh();

  let r = await client.sync();
  check("발행된 스냅샷이 없으면 404", [r.status, r.bytes, r.changed], [404, 0, false]);

  publish(win, snapshot(1, "v1-aaa"));
  r = await client.sync();
  check("최초 동기화는 200이고 내용을 받는다", [r.status, r.changed, r.bytes > 0], [200, true, true]);
  check("받은 버전이 반영된다", r.version, 1);

  r = await client.sync();
  check("변경이 없으면 304이고 수신 0 B", [r.status, r.bytes, r.changed], [304, 0, false]);
  check("304여도 버전은 유지된다", r.version, 1);

  publish(win, snapshot(2, "v2-bbb"));
  r = await client.sync();
  check("새로 발행되면 다시 200", [r.status, r.changed, r.version], [200, true, 2]);
}

/* =========================================================================
   3. 조회
   ========================================================================= */
{
  group("3. 조회");
  const { win, client } = fresh("allone");
  publish(win, snapshot(1, "v1-aaa"));
  await client.sync();

  check("등록된 표현으로 기능을 찾는다", client.lookup("k패스카드").name, "교통비 환급 카드 신청");
  check("표기가 달라도 같은 기능을 찾는다", client.lookup("K-패스 카드").name, "교통비 환급 카드 신청");
  check("다른 별칭도 같은 기능으로 간다", client.lookup("경기패스카드").name, "교통비 환급 카드 신청");
  check("등록되지 않은 표현은 null", client.lookup("전세자금대출"), null);
  check("채널과 다음 행동이 함께 온다",
    [client.lookup("케이패스").channels.length, client.lookup("케이패스").next],
    [2, "카드 목록에서 K-패스카드를 찾아 신청"]);

  const nhpay = fresh("nhpay");
  publish(nhpay.win, snapshot(1, "v1-aaa"));
  await nhpay.client.sync();
  check("중앙이 미노출로 지정한 앱에서는 안내하지 않는다", nhpay.client.lookup("k패스카드"), null);
  check("미노출 대상이 아닌 기능은 그 앱에서도 나온다", nhpay.client.lookup("조합원배당조회").name, "조합원 배당 조회");
}

/* =========================================================================
   4. 실패에 대한 방어 — 안내만 생략하고 검색 자체는 살린다
   ========================================================================= */
{
  group("4. 실패 방어");
  const { win, client } = fresh();

  check("스냅샷이 아예 없어도 예외 없이 null", client.lookup("k패스카드"), null);

  publish(win, snapshot(1, "v1-aaa"));
  await client.sync();

  win.localStorage.setItem("routing:snapshot", "{망가진 내용");
  client.refresh();                            // 다른 탭이 저장소를 망가뜨린 상황을 흉내낸다

  let threw = false;
  let got;
  try { got = client.lookup("k패스카드"); } catch (e) { threw = true; }
  check("손상된 스냅샷에서 예외를 내지 않는다", threw, false);
  check("손상된 스냅샷에서는 null을 준다", got, null);
  check("손상 상태에서 status()도 죽지 않는다", client.status().hasCache, false);

  /* 손상은 스스로 회복돼야 한다.
     etag를 남겨두면 다음 동기화가 304를 받아 깨진 캐시를 계속 안고 간다. */
  check("스냅샷을 못 읽으면 etag를 버린다", client.status().etag, null);

  const rec = await client.sync();
  check("동기화 한 번으로 다시 받아온다", [rec.status, rec.changed], [200, true]);
  check("손상 전 검색이 되살아난다", client.lookup("k패스카드").name, "교통비 환급 카드 신청");
}

/* =========================================================================
   4-1. 정상일 때는 여전히 304로 끝나는지 (회귀 방지)

   위 회복 장치가 멀쩡한 캐시의 etag까지 버리면
   `304 · 수신 0 B`라는 이 설계의 대표 성질이 무너진다.
   ========================================================================= */
{
  group("4-1. 정상일 때 304 유지");
  const { win, client } = fresh();
  publish(win, snapshot(1, "v1-aaa"));

  await client.sync();
  const again = await client.sync();
  check("변경이 없으면 304 · 수신 0 B", [again.status, again.bytes], [304, 0]);

  client.lookup("k패스카드");
  const third = await client.sync();
  check("조회를 한 뒤에도 304를 유지한다", [third.status, third.bytes], [304, 0]);
  check("정상 캐시의 etag는 그대로 남는다", client.status().etag, "v1-aaa");
}

/* =========================================================================
   5. 펼쳐둔 스냅샷 캐시 (2026-08-25 추가)
   ========================================================================= */
{
  group("5. 펼쳐둔 스냅샷 캐시");
  const { win, client } = fresh();
  publish(win, snapshot(1, "v1-aaa"));
  await client.sync();

  client.lookup("k패스카드");
  ok("두 번째 조회는 같은 객체를 다시 쓴다", client.snapshot() === client.snapshot());

  publish(win, snapshot(2, "v2-bbb"));
  const before = client.snapshot();
  await client.sync();
  ok("새 스냅샷을 받으면 펼쳐둔 것을 버린다", client.snapshot() !== before);
  check("새로 받은 버전이 조회에 반영된다", client.version(), 2);

  client.clearCache();
  check("캐시를 비우면 조회가 null", client.lookup("k패스카드"), null);
  check("캐시를 비우면 hasCache도 false", client.status().hasCache, false);

  await client.sync();
  check("비운 뒤 다시 동기화하면 조회가 살아난다", client.lookup("k패스카드").name, "교통비 환급 카드 신청");

  publish(win, snapshot(3, "v3-ccc"));
  check("동기화 전에는 다른 탭의 발행이 보이지 않는다", client.version(), 2);
  win.localStorage.setItem("routing:snapshot", JSON.stringify(snapshot(3, "v3-ccc")));
  client.refresh();
  check("refresh()는 저장소를 다시 읽는다", client.version(), 3);
}

/* =========================================================================
   6. 상태 보고
   ========================================================================= */
{
  group("6. 상태 보고");
  const { win, client } = fresh();
  check("동기화 전에는 캐시 없음", client.status().hasCache, false);

  publish(win, snapshot(1, "v1-aaa"));
  await client.sync();
  const s = client.status();
  check("표현 키 개수를 센다", s.entries, 4);
  check("기능 개수를 센다", s.functions, 2);
  check("etag를 보관한다", s.etag, "v1-aaa");
  ok("스냅샷 크기를 바이트로 보고한다", s.bytes > 0);
}

/* =========================================================================
   7. 조회 비용이 스냅샷 크기와 무관한지
   ========================================================================= */
{
  group("7. 조회 비용이 스냅샷 크기와 무관한지");

  function big(nFn, aliasPerFn) {
    const index = {}, functions = {};
    for (let i = 0; i < nFn; i++) {
      const id = "f-" + String(i).padStart(4, "0");
      for (let a = 0; a < aliasPerFn; a++) index["표현" + i + "별칭" + a] = id;
      functions[id] = { name: "업무 " + i, next: "다음 행동", suppressIn: [], channels: [] };
    }
    return { version: 1, publishedAt: "x", tenant: "t", etag: "e" + nFn, index, functions };
  }

  async function avgMs(nFn, aliasPerFn, query) {
    const { win, client } = fresh();
    publish(win, big(nFn, aliasPerFn));
    await client.sync();
    for (let i = 0; i < 2000; i++) client.lookup(query);           // 예열
    const t = process.hrtime.bigint();
    for (let i = 0; i < 20000; i++) client.lookup(query);
    return Number(process.hrtime.bigint() - t) / 1e6 / 20000;
  }

  const small = await avgMs(1, 4, "표현0별칭0");
  const large = await avgMs(500, 20, "표현499별칭19");
  const huge = await avgMs(2000, 20, "표현1999별칭19");

  const fmt = (v) => v.toFixed(5) + " ms";
  console.log("  기능 1건        조회 1회 평균 " + fmt(small));
  console.log("  기능 500건      조회 1회 평균 " + fmt(large));
  console.log("  기능 2,000건    조회 1회 평균 " + fmt(huge));

  ok("기능 500건이 1건보다 5배 넘게 느려지지 않는다", large < Math.max(small * 5, 0.001));
  ok("기능 2,000건이 1건보다 5배 넘게 느려지지 않는다", huge < Math.max(small * 5, 0.001));
  ok("조회 1회가 0.01 ms 미만이다", huge < 0.01);
}

/* =========================================================================
   8. 발행 관문 — console.html 에서 함수만 꺼내 확인한다

   승인된 기준이 없는데 발행하면 빈 기준이 나가고, 앱은 동기화에 성공하고도
   아무 안내를 띄우지 못한다. 그 상황과, 승인이 풀려 기준이 조용히 빠지는
   상황을 콘솔이 미리 잡아내는지 본다.
   ========================================================================= */
{
  group("8. 발행 관문");

  const consoleSrc = fs.readFileSync(new URL("./console.html", import.meta.url), "utf8");
  const m = consoleSrc.match(/function droppedFromLast\(approved\)\{[\s\S]*?\n  \}/);
  ok("console.html 에서 droppedFromLast 를 찾았다", !!m);

  if (m) {
    const store = new Map();
    const ls = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k)
    };
    const KEY = "routing:published";
    const droppedFromLast = new Function("localStorage", "CHANNEL_KEY", m[0] + "; return droppedFromLast;")(ls, KEY);

    check("발행한 적이 없으면 빠지는 것도 없다", droppedFromLast([{ id: "f-101" }]), []);

    ls.setItem(KEY, JSON.stringify({
      version: 1, etag: "v1-x", index: {},
      functions: { "f-101": { name: "자동이체 해지" }, "f-103": { name: "조합원 배당 조회" } }
    }));

    check("승인 목록이 이전과 같으면 빠지는 것 없음", droppedFromLast([{ id: "f-101" }, { id: "f-103" }]), []);
    check("승인이 풀린 기준을 이름으로 집어낸다", droppedFromLast([{ id: "f-101" }]), ["조합원 배당 조회"]);
    check("전부 승인이 풀리면 둘 다 집어낸다", droppedFromLast([]), ["자동이체 해지", "조합원 배당 조회"]);
    check("새로 늘어난 기준은 빠지는 것으로 세지 않는다",
      droppedFromLast([{ id: "f-101" }, { id: "f-103" }, { id: "f-999" }]), []);

    ls.setItem(KEY, "{망가진 내용");
    check("이전 스냅샷이 손상돼 있어도 예외 없이 빈 배열", droppedFromLast([{ id: "f-101" }]), []);
  }
}

/* =========================================================================
   9. 같은 내용을 다시 발행하지 않는지

   버전과 etag가 올라가면 앱은 똑같은 내용을 200으로 다시 내려받는다.
   바뀐 게 없으면 304로 끝나야 하므로, 콘솔이 내용 해시로 판별하는지 본다.
   ========================================================================= */
{
  group("9. 같은 내용 재발행 차단");

  const consoleSrc = fs.readFileSync(new URL("./console.html", import.meta.url), "utf8");
  const hashSrc = consoleSrc.match(/function hash\(s\)\{[\s\S]*?\n  \}/);
  const bodySrc = consoleSrc.match(/function lastBodyHash\(snap\)\{[\s\S]*?\n  \}/);
  ok("console.html 에서 hash 를 찾았다", !!hashSrc);
  ok("console.html 에서 lastBodyHash 를 찾았다", !!bodySrc);

  if (hashSrc && bodySrc) {
    const mod = new Function(
      hashSrc[0] + "; " + bodySrc[0] + "; return { hash: hash, lastBodyHash: lastBodyHash };"
    )();

    const idxA = { "k패스카드": "f-001" };
    const fnA = { "f-001": { name: "교통비 환급 카드 신청" } };
    const idxB = { "k패스카드": "f-001", "케이패스": "f-001" };

    const bodyA = mod.hash(JSON.stringify(idxA) + JSON.stringify(fnA));
    const bodyB = mod.hash(JSON.stringify(idxB) + JSON.stringify(fnA));

    check("같은 내용은 같은 해시", mod.hash(JSON.stringify(idxA) + JSON.stringify(fnA)), bodyA);
    ok("표현이 하나 늘면 해시가 달라진다", bodyA !== bodyB);

    check("etag 에서 내용 해시를 꺼낸다",
      mod.lastBodyHash({ etag: "v7-" + bodyA, index: idxA, functions: fnA }), bodyA);

    check("etag 가 없으면 내용에서 다시 계산한다",
      mod.lastBodyHash({ index: idxA, functions: fnA }), bodyA);

    check("빈 스냅샷에도 예외 없이 값을 준다",
      typeof mod.lastBodyHash({}), "string");

    /* 발행 여부 판정 자체 */
    const wouldPublish = (lastSnap, idx, fns) =>
      !(lastSnap && mod.lastBodyHash(lastSnap) === mod.hash(JSON.stringify(idx) + JSON.stringify(fns)));

    check("첫 발행은 진행한다", wouldPublish(null, idxA, fnA), true);
    check("내용이 같으면 발행하지 않는다",
      wouldPublish({ version: 3, etag: "v3-" + bodyA }, idxA, fnA), false);
    check("표현이 늘면 발행한다",
      wouldPublish({ version: 3, etag: "v3-" + bodyA }, idxB, fnA), true);
  }
}

/* =========================================================================
   10. 발행 이력

   잘못 나간 발행을 되돌리려면 이전 스냅샷이 남아 있어야 한다.
   브라우저 저장소를 쓰므로 무한히 쌓지 않고 최근 것만 남긴다.
   ========================================================================= */
{
  group("10. 발행 이력");

  const consoleSrc = fs.readFileSync(new URL("./console.html", import.meta.url), "utf8");
  const loadSrc = consoleSrc.match(/function loadHistory\(\)\{[\s\S]*?\n  \}/);
  const pushSrc = consoleSrc.match(/function pushHistory\(snap\)\{[\s\S]*?\n  \}/);
  const maxSrc = consoleSrc.match(/var HISTORY_MAX = (\d+);/);
  ok("console.html 에서 loadHistory 를 찾았다", !!loadSrc);
  ok("console.html 에서 pushHistory 를 찾았다", !!pushSrc);
  ok("보관 상한이 정의돼 있다", !!maxSrc);

  if (loadSrc && pushSrc && maxSrc) {
    const MAX = Number(maxSrc[1]);
    const store = new Map();
    const ls = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k)
    };
    const KEY = "routing:history";
    const mod = new Function(
      "localStorage", "HISTORY_KEY", "HISTORY_MAX",
      loadSrc[0] + "; " + pushSrc[0] + "; return { loadHistory: loadHistory, pushHistory: pushHistory };"
    )(ls, KEY, MAX);

    const snapOf = (v) => ({ version: v, publishedAt: "2026-08-25T00:00:00.000Z", etag: "v" + v + "-h" + v, index: {}, functions: {} });

    check("이력이 없으면 빈 배열", mod.loadHistory(), []);

    ls.setItem(KEY, "{망가진 내용");
    check("손상된 이력이면 빈 배열", mod.loadHistory(), []);

    ls.setItem(KEY, JSON.stringify({ 배열이: "아님" }));
    check("배열이 아니면 빈 배열", mod.loadHistory(), []);

    ls.removeItem(KEY);
    mod.pushHistory(snapOf(1));
    check("발행하면 이력에 쌓인다", mod.loadHistory().length, 1);

    mod.pushHistory(snapOf(2));
    check("최신이 맨 앞이다", mod.loadHistory().map((s) => s.version), [2, 1]);

    mod.pushHistory(snapOf(2));
    check("같은 버전은 두 번 쌓이지 않는다", mod.loadHistory().map((s) => s.version), [2, 1]);

    for (let v = 3; v <= MAX + 3; v++) mod.pushHistory(snapOf(v));
    const kept = mod.loadHistory();
    check("보관 상한을 넘지 않는다", kept.length, MAX);
    check("가장 최근 버전이 맨 앞이다", kept[0].version, MAX + 3);
    check("상한을 넘으면 오래된 것부터 밀려난다", kept.some((s) => s.version === 1), false);

    /* 이력 비우기 — 지금 배포된 한 줄만 남긴다 */
    const clearSrc = consoleSrc.match(/function clearHistory\(current\)\{[\s\S]*?\n  \}/);
    ok("console.html 에서 clearHistory 를 찾았다", !!clearSrc);

    if (clearSrc) {
      const clearHistory = new Function(
        "localStorage", "HISTORY_KEY", "loadHistory",
        clearSrc[0] + "; return clearHistory;"
      )(ls, KEY, mod.loadHistory);

      const current = kept[0];
      const after = clearHistory(current);
      check("비운 뒤에는 현재 배포본 한 줄만 남는다", after.map((s) => s.version), [current.version]);
      check("되돌릴 이전 버전이 사라진다", after.length, 1);

      check("현재 배포본이 없으면 통째로 비운다", clearHistory(null), []);

      mod.pushHistory(snapOf(99));
      check("비운 뒤에도 새 발행은 정상으로 쌓인다", mod.loadHistory().map((s) => s.version), [99]);
    }
  }
}

/* =========================================================================
   11. 이상 입력 방어

   정규화는 검색어 글자 수에 비례한다. 계열사 앱의 입력창은 이 코드가
   통제할 수 없으므로, 아주 긴 입력이 그대로 들어와도 시간이 늘지 않아야 한다.
   ========================================================================= */
{
  group("11. 이상 입력 방어");

  const { win, RC, client } = fresh();
  publish(win, snapshot(1, "v1-aaa"));
  await client.sync();

  const MAX = RC.MAX_QUERY;
  ok("상한이 정의돼 있다", typeof MAX === "number" && MAX > 0);

  /* 회귀 — 사람이 치는 검색어는 그대로 동작해야 한다 */
  check("짧은 검색어는 그대로 동작한다", client.lookup("케이패스").name, "교통비 환급 카드 신청");

  /* 경계 */
  const pad = (n) => "가".repeat(n);
  check("상한 길이까지는 조회한다", client.lookup(pad(MAX)), null);        // 등록 안 됐으니 null이되 예외 없음
  check("상한을 넘으면 null", client.lookup(pad(MAX + 1)), null);

  /* 상한을 넘으면 스냅샷을 읽지도 않아야 한다 —
     캐시를 비워 스냅샷이 없는 상태로 만들어도 결과가 같은지로 확인한다 */
  let threw = false;
  try { client.lookup(pad(1000000)); } catch (e) { threw = true; }
  check("1 MB 입력에도 예외를 내지 않는다", threw, false);

  /* 이상한 타입 */
  check("null 검색어", client.lookup(null), null);
  check("undefined 검색어", client.lookup(undefined), null);
  check("숫자 검색어", client.lookup(12345), null);
  check("빈 문자열", client.lookup(""), null);

  /* 시간 — 아주 긴 입력이 짧은 입력과 같은 수준이어야 한다 */
  function avg(q, rounds) {
    for (let i = 0; i < 200; i++) client.lookup(q);
    const t = process.hrtime.bigint();
    for (let i = 0; i < rounds; i++) client.lookup(q);
    return Number(process.hrtime.bigint() - t) / 1e6 / rounds;
  }
  const short = avg("케이패스", 20000);
  const huge = avg(pad(1000000), 2000);
  console.log("  짧은 검색어   " + short.toFixed(5) + " ms");
  console.log("  1 MB 입력     " + huge.toFixed(5) + " ms");
  ok("1 MB 입력이 짧은 검색어의 5배를 넘지 않는다", huge < Math.max(short * 5, 0.001));
}

/* =========================================================================
   12. 화면에 그려지는 값 이스케이프

   콘솔은 계열사가 올린 CSV를, 앱은 사용자가 친 검색어를 화면에 그린다.
   둘 다 innerHTML 로 그리므로 막지 않으면 태그가 살아난다.
   ========================================================================= */
{
  group("12. 이스케이프");

  const pages = {
    "console.html": fs.readFileSync(new URL("./console.html", import.meta.url), "utf8"),
    "bank-app.html": fs.readFileSync(new URL("./bank-app.html", import.meta.url), "utf8")
  };

  const escs = {};
  for (const [name, src] of Object.entries(pages)) {
    const m = src.match(/function esc\(s\)\{[\s\S]*?\n  \}/);
    ok(name + " 에서 esc 를 찾았다", !!m);
    if (m) escs[name] = new Function(m[0] + "; return esc;")();
  }

  for (const [name, esc] of Object.entries(escs)) {
    check(name + " — 꺾쇠를 막는다", esc("<script>"), "&lt;script&gt;");
    check(name + " — 앰퍼샌드를 막는다", esc("a&b"), "a&amp;b");
    check(name + " — 큰따옴표를 막는다", esc('a"b'), "a&quot;b");
    check(name + " — 작은따옴표를 막는다", esc("a'b"), "a&#39;b");
    check(name + " — null 에도 빈 문자열", esc(null), "");
  }

  /* 속성값 안에 넣어도 속성을 빠져나가지 못해야 한다 */
  if (escs["console.html"]) {
    const esc = escs["console.html"];
    const attack = '" onfocus="alert(1)" x="';
    const html = '<input value="' + esc(attack) + '">';
    ok("속성 안에서 빠져나가지 못한다", !/value="".*onfocus=/.test(html));
    check("속성 하나로 유지된다", (html.match(/"/g) || []).length, 2);
  }

  /* 검색어를 로그에 넣는 자리가 esc 를 거치는지 (원본 코드 확인) */
  const logLine = (pages["bank-app.html"].split(/\r?\n/).find((l) => l.includes('log("lookup(')) || "");
  ok("동기화 로그가 검색어를 그대로 넣지 않는다", logLine.includes("esc(query)"));

  if (escs["bank-app.html"]) {
    const esc = escs["bank-app.html"];
    const rendered = 'lookup("' + esc('<img src=x onerror="alert(1)">') + '")';
    ok("로그에 넣어도 태그가 살아나지 않는다", !rendered.includes("<img"));
  }
}

/* =========================================================================
   기준 삭제 — console.html 에서 함수만 꺼내 확인한다

   삭제는 지우고 끝나는 동작이 아니다. 이미 발행된 기준을 지우면 계열사 앱에
   나가 있는 안내가 다음 발행에서 사라진다. 지우기 전에 그 사실을 알리는지,
   그리고 발행이 막히는 막다른 길(승인 0건)을 미리 집어내는지 본다.
   ========================================================================= */
{
  group("기준 삭제");

  const consoleSrc = fs.readFileSync(new URL("./console.html", import.meta.url), "utf8");
  const planSrc = consoleSrc.match(/function deletePlan\(rules, id, published\)\{[\s\S]*?\n  \}/);
  const msgSrc = consoleSrc.match(/function deleteMessage\(plan\)\{[\s\S]*?\n  \}/);
  ok("console.html 에서 deletePlan 을 찾았다", !!planSrc);
  ok("console.html 에서 deleteMessage 를 찾았다", !!msgSrc);

  if (planSrc && msgSrc) {
    const deletePlan = new Function(planSrc[0] + "; return deletePlan;")();
    const deleteMessage = new Function("NL", msgSrc[0] + "; return deleteMessage;")("\n");

    const rules = [
      { id: "f-101", func: "자동이체 해지", state: "approved" },
      { id: "f-103", func: "조합원 배당 조회", state: "approved" },
      { id: "f-201", func: "통장사본 발급", state: "draft" }
    ];
    const published = { functions: { "f-101": { name: "자동이체 해지" } } };

    check("없는 id 는 계획을 내지 않는다", deletePlan(rules, "f-999", published), null);

    const a = deletePlan(rules, "f-101", published);
    check("발행된 기준임을 알아낸다", a.wasPublished, true);
    check("지울 대상은 남는 승인 수에서 뺀다", a.approvedAfter, 1);
    check("다른 승인이 남아 있으면 발행이 막히지 않는다", a.blocksPublish, false);
    check("이름을 그대로 넘긴다", a.name, "자동이체 해지");

    const b = deletePlan(rules, "f-201", published);
    check("발행된 적 없는 기준은 앱에 영향이 없다", b.wasPublished, false);
    check("미발행 기준은 발행을 막지 않는다", b.blocksPublish, false);
    check("승인 상태가 아닌 대상을 지워도 승인 수는 그대로", b.approvedAfter, 2);

    /* 발행된 기준이 유일한 승인이면, 지운 뒤 발행하려 해도 관문 1이 막는다 */
    const only = [{ id: "f-101", func: "자동이체 해지", state: "approved" }];
    const c = deletePlan(only, "f-101", published);
    check("승인이 하나뿐이면 발행이 막힌다고 알린다", c.blocksPublish, true);
    check("남는 승인은 0건", c.approvedAfter, 0);

    /* 발행 스냅샷이 없을 때도 예외 없이 계획이 나온다 */
    const d = deletePlan(rules, "f-101", null);
    check("발행한 적이 없으면 발행된 기준이 아니다", d.wasPublished, false);
    check("스냅샷이 손상돼 functions 가 없어도 버틴다",
      deletePlan(rules, "f-101", { version: 1 }).wasPublished, false);

    /* ---- 확인창 문구 ---- */
    const mA = deleteMessage(a);
    ok("발행된 기준은 앱에 나가 있다고 알린다", mA.includes("계열사 앱에 나가 있습니다"));
    ok("발행을 눌러야 반영된다고 알린다", mA.includes("승인된 기준 발행"));
    ok("문구에 기준 이름이 들어간다", mA.includes("자동이체 해지"));
    ok("마지막에 되묻는다", mA.trim().endsWith("지울까요?"));

    const mB = deleteMessage(b);
    ok("미발행 기준은 영향이 없다고 알린다", mB.includes("영향이 없습니다"));
    ok("미발행 기준에는 발행 안내를 붙이지 않는다", !mB.includes("계열사 앱에 나가 있습니다"));

    const mC = deleteMessage(c);
    ok("발행이 막히는 경우를 문구로 알린다", mC.includes("승인된 기준이 0건이 됩니다"));
    ok("막혔을 때 무엇을 하면 되는지 알린다",
      mC.includes("캐시 비우기") && mC.includes("다른 기준을 승인"));
  }

  /* ---- 화면 쪽 계약 ---- */
  ok("모든 행에 삭제 버튼이 붙는다", /data-act="del"/.test(consoleSrc));
  ok("확인 없이 지우지 않는다",
    /function deleteRule\(id\)\{[\s\S]*?confirm\(deleteMessage\(plan\)\)/.test(consoleSrc));
  ok("삭제는 목록에서 걸러내는 방식이다 — 인덱스로 잘라내지 않는다",
    consoleSrc.includes('st.rules.filter(function(r){ return r.id !== id; })'));
  ok("발행 바가 사라질 기준 수를 미리 보여준다",
    consoleSrc.includes("발행하면 앱에서 <b>") && consoleSrc.includes('$("kvDrop")'));
}

/* =========================================================================
   앱 디자인 컴포넌트 — app-themes.js

   라우터는 데이터만 주고 화면은 각 앱이 그린다는 설계를 검사로 못박는다.
   같은 데이터를 넣어 마크업이 서로 달라야 하고, 렌더러가 깨져도 검색은
   멈추지 않아야 하며, 앱별 강조색은 접근성 대비 기준을 지켜야 한다.
   측정값의 출처와 기준은 docs/디자인_기준.md.
   ========================================================================= */
{
  group("앱 디자인 컴포넌트 — 로드와 토큰");

  const themeSrc = fs.readFileSync(new URL("./app-themes.js", import.meta.url), "utf8");
  const twin = {};
  new Function("window", themeSrc)(twin);
  const AT = twin.AppThemes;

  ok("app-themes.js 가 전역에 붙는다", !!AT);
  check("네 앱의 id", AT.ids, ["allone", "kok", "smart", "nhpay"]);

  for (const id of AT.ids) {
    ok(id + " 테마가 있다", !!AT.themes[id]);
    ok(id + " 렌더러가 있다", !!AT.renderers[id]);
  }

  /* 앱마다 강조색이 달라야 한다 — 이 프로젝트가 관찰한 사실이 그렇다 */
  const accents = AT.ids.map((id) => AT.themes[id].accent);
  check("네 앱의 강조색이 서로 다르다", new Set(accents).size, 4);
  check("콕뱅크는 청록", AT.themes.kok.accent, "#0296A2");
  check("NH Pay 는 네이비", AT.themes.nhpay.accent, "#313E60");

  /* ---------------------------------------------------------------- */
  group("앱 디자인 컴포넌트 — 같은 데이터, 다른 화면");

  const HIT = {
    name: "교통비 환급 카드 신청",
    next: "카드 목록에서 K-패스카드를 찾아 신청",
    channels: [
      { id: "nhpay", name: "NH Pay", role: "완료" },
      { id: "cardweb", name: "NH농협카드 모바일웹", role: "경유" },
      { id: "allone", name: "NH올원뱅크", role: "안내" }
    ]
  };

  const cards = {};
  for (const id of AT.ids) cards[id] = AT.safe(id, "guideCard", HIT);

  check("네 앱의 안내 카드 마크업이 모두 다르다",
    new Set(Object.values(cards)).size, AT.ids.length);

  const ownClass = { allone: "gd-allone", kok: "gd-kok", smart: "gd-smart", nhpay: "gd-pay" };
  for (const id of AT.ids) {
    ok(id + " 는 자기 클래스로 그린다", cards[id].includes(ownClass[id]));
    /* 다른 앱의 클래스가 섞여 들어가지 않는다 */
    const others = AT.ids.filter((x) => x !== id).map((x) => ownClass[x]);
    ok(id + " 에 다른 앱 클래스가 섞이지 않는다", others.every((c) => !cards[id].includes(c)));
  }

  /* 라우터가 준 값이 빠짐없이 화면에 실려야 한다 */
  for (const id of AT.ids) {
    ok(id + " 에 기능명이 실린다", cards[id].includes(HIT.name));
    ok(id + " 에 다음 행동이 실린다", cards[id].includes(HIT.next));
    ok(id + " 에 채널 세 개가 모두 실린다",
      HIT.channels.every((c) => cards[id].includes(c.name)));
    ok(id + " 에 역할이 실린다",
      HIT.channels.every((c) => cards[id].includes(c.role)));
  }

  /* 섹션 머리글도 앱마다 표기가 다르다 (실측: "메뉴 39건" / "메뉴 (총 15건)" / "카드 2") */
  const heads = AT.ids.map((id) => AT.safe(id, "sectionHeader", { label: "메뉴", count: 39 }));
  check("섹션 머리글도 앱마다 다르다", new Set(heads).size, AT.ids.length);
  ok("스마트뱅킹은 괄호 표기", heads[AT.ids.indexOf("smart")].includes("(총 39건)"));
  ok("NH Pay 는 전체보기 어피던스", heads[AT.ids.indexOf("nhpay")].includes("전체보기"));

  /* ---------------------------------------------------------------- */
  group("앱 디자인 컴포넌트 — 실패 방어");

  ok("모르는 앱 id 는 최소 구현으로 떨어진다",
    AT.safe("없는앱", "guideCard", HIT).includes("gd-base"));

  const keep = AT.renderers.smart.guideCard;
  AT.renderers.smart.guideCard = () => { throw new Error("boom"); };
  ok("렌더러가 예외를 던져도 최소 구현이 나온다",
    AT.safe("smart", "guideCard", HIT).includes("gd-base"));
  AT.renderers.smart.guideCard = () => 42;
  ok("렌더러가 문자열이 아닌 것을 줘도 최소 구현이 나온다",
    AT.safe("smart", "guideCard", HIT).includes("gd-base"));
  AT.renderers.smart.guideCard = keep;
  ok("되돌린 뒤 원래 렌더러로 돌아온다",
    AT.safe("smart", "guideCard", HIT).includes("gd-smart"));

  /* 어떤 경우에도 문자열을 준다 — 화면 조립이 undefined 로 오염되지 않는다 */
  ok("safe 는 항상 문자열을 준다",
    AT.ids.concat(["없는앱"]).every((id) =>
      ["guideCard", "sectionHeader", "resultRow", "emptyState"].every((fn) =>
        typeof AT.safe(id, fn, fn === "sectionHeader" ? { label: "x", count: 0 } : HIT) === "string")));

  /* ---------------------------------------------------------------- */
  group("앱 디자인 컴포넌트 — 이스케이프");

  const NASTY = {
    name: '<img src=x onerror="alert(1)">',
    next: '"><b>next</b>',
    channels: [{ id: "x", name: "<script>alert(1)</script>", role: "완료" }]
  };
  for (const id of AT.ids.concat(["없는앱"])) {
    const out = AT.safe(id, "guideCard", NASTY);
    ok(id + " — img 태그가 살아나지 않는다", !out.includes("<img"));
    ok(id + " — script 태그가 살아나지 않는다", !out.includes("<script"));
    /* 꺾쇠와 따옴표가 실체참조로 바뀌어 태그도 속성도 만들어지지 않는다.
       이스케이프된 뒤의 문자열은 화면에 글자로 보일 뿐이므로 그대로 있어도 된다. */
    ok(id + " — 사용자 값이 실체참조로 바뀐다",
      out.includes("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"));
    ok(id + " — 다음 행동의 따옴표도 막힌다",
      out.includes("&quot;&gt;&lt;b&gt;next&lt;/b&gt;"));
  }
  ok("결과 행은 as-is 실측 마크업이라 그대로 통과시킨다",
    AT.safe("allone", "resultRow", '<span class="g">카드</span>').includes('<span class="g">'));

  /* ---------------------------------------------------------------- */
  group("앱 디자인 컴포넌트 — 스타일시트와 대비");

  const css = AT.css();
  for (const id of AT.ids) {
    ok(id + " 테마 규칙이 스타일시트에 있다", css.includes(".theme-" + id));
    ok(id + " 안내 카드 규칙이 스타일시트에 있다", css.includes("." + ownClass[id]));
  }
  ok("실측 청록이 스타일시트에 들어간다", css.includes("#0296A2"));
  ok("실측 네이비가 스타일시트에 들어간다", css.includes("#313E60"));

  /* 접근성 — WCAG 2.1 상대 휘도로 흰 배경 대비를 계산한다.
     docs/디자인_기준.md 에서 실측 강조색이 본문 크기 기준(4.5:1)에 미달함을
     확인했으므로, 글자에 쓰는 값(accentText)은 반드시 통과해야 한다. */
  const lin = (c) => (c /= 255) <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const lum = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  };
  const onWhite = (hex) => (1.05) / (lum(hex) + 0.05);

  for (const id of AT.ids) {
    const th = AT.themes[id];
    ok(id + " 본문 강조색이 흰 배경 대비 4.5:1 이상", onWhite(th.accentText) >= 4.5);
    ok(id + " 면·테두리색이 흰 배경 대비 3:1 이상", onWhite(th.accent) >= 3.0);
  }
  ok("NH Pay 링크색도 본문 기준을 지킨다", onWhite(AT.themes.nhpay.linkText) >= 4.5);

  const bankSrc = fs.readFileSync(new URL("./bank-app.html", import.meta.url), "utf8");

  /* ---------------------------------------------------------------- */
  group("앱 디자인 컴포넌트 — 기기 껍데기");

  /* 상태바와 하단 내비게이션 색은 앱이 정한다. 캡처에서 픽셀로 뽑은 값이므로
     눈대중으로 바뀌지 않게 여기서 못박는다. 근거는 docs/디자인_기준.md. */
  const DEVICE = {
    allone: { navBar: "light", navBarColor: "#FFFFFF", statusBar: "light", statusBarColor: "#FFFFFF" },
    kok:    { navBar: "light", navBarColor: "#FFFFFF", statusBar: "light", statusBarColor: "#FFFFFF" },
    smart:  { navBar: "dark",  navBarColor: "#343434", statusBar: "light", statusBarColor: "#FFFFFF" },
    nhpay:  { navBar: "dark",  navBarColor: "#1D1D1D", statusBar: "dark",  statusBarColor: "#303030" }
  };

  for (const id of AT.ids) {
    const th = AT.themes[id];
    check(id + " 내비게이션 바 실측값", th.navBarColor, DEVICE[id].navBarColor);
    check(id + " 상태바 실측값", th.statusBarColor, DEVICE[id].statusBarColor);
    check(id + " 내비게이션 바 밝기", th.navBar, DEVICE[id].navBar);
    check(id + " 상태바 밝기", th.statusBar, DEVICE[id].statusBar);
    ok(id + " 내비게이션 바 색이 스타일시트에 들어간다",
      css.includes(".theme-" + id + " .navbar{background:" + DEVICE[id].navBarColor));
  }

  /* 앱마다 다르다는 것이 이 토큰을 둔 이유다 — 넷이 다 같으면 의미가 없다 */
  ok("네 앱의 기기 껍데기가 한 벌로 통일돼 있지 않다",
    new Set(AT.ids.map((id) => AT.themes[id].navBarColor + AT.themes[id].statusBarColor)).size > 1);

  ok("어두운 상태바에는 밝은 글자를 쓴다",
    css.includes(".theme-nhpay .statusbar{background:#303030;color:#f2f3f5}"));

  /* 프레임은 CSS 도형으로 그린다 — 목업 도구나 기기 사진을 쓰지 않는다.
     실측이 삼성/안드로이드라 아이폰 프레임을 쓰면 리서치와 어긋난다. */
  ok("폰을 디바이스 프레임으로 감싼다", bankSrc.includes('<div class="device">'));
  ok("하단 내비게이션 세 버튼을 그린다",
    bankSrc.includes('class="nb-recent"') && bankSrc.includes('class="nb-home"') && bankSrc.includes('class="nb-back"'));
  ok("프레임에 기기 사진을 쓰지 않는다", !/\.device[^{]*\{[^}]*background-image/.test(bankSrc));
  ok("발표 모드가 프레임째로 확대한다", bankSrc.includes("body.present .device{zoom:1.1}"));

  /* 폰에 고정 높이가 없어서 검색 결과와 칩 줄에 따라 491~626px 사이를 오갔다.
     실제 폰은 화면이 고정이고 내용이 안에서 스크롤된다. */
  ok("폰 화면 높이가 고정돼 있다", /\.device \.phone\{[^}]*height:780px/.test(bankSrc));
  ok("본문만 스크롤한다",
    /\.device \.phone \.body\{[^}]*overflow-y:auto/.test(bankSrc));
  ok("본문 최소 높이가 풀려 있다 — 안 풀면 고정 높이를 넘어선다",
    /\.device \.phone \.body\{[^}]*min-height:0/.test(bankSrc));
  /* 비교 뷰의 미니 폰은 캡처해서 슬라이드에 넣는 그림이라 고정하지 않는다 */
  ok("높이 고정이 프레임 안쪽으로만 걸려 있다", !/(^|[^ ])\.phone\{[^}]*height:780px/.test(bankSrc));
  ok("칩이 0개면 줄을 감춘다", bankSrc.includes(".chips:empty{display:none}"));

  /* 폭도 고정한다. 프레임이 그리드 칼럼만큼 늘어나면 발표 모드(auto 칼럼)와
     좁은 화면(1fr 칼럼)에서 폰 폭이 달라진다. */
  ok("화면 폭도 고정돼 있다", /\.device \.phone\{[^}]*width:360px/.test(bankSrc));
  ok("프레임이 화면 크기만큼만 차지한다",
    /\.device\{[^}]*display:inline-block/.test(bankSrc));
  /* 비교 패널은 폰과 계측 아래에 생겨 첫 화면 밖이다 — 켤 때 그 자리로 데려간다 */
  ok("비교를 켜면 패널로 데려간다",
    /cmpBtn[\s\S]{0,600}scrollIntoView/.test(bankSrc));

  /* 비교 패널의 목적은 「같은 데이터가 네 디자인으로 그려진다」다.
     client.lookup() 은 미노출 앱에서 null 을 돌려주므로, 담당 본인 앱을 고른
     상태에서 비교 패널이 예시 데이터로 떨어지는 결함이 있었다. */
  ok("비교 패널은 스냅샷에서 직접 꺼낸다", /function publishedFunction\(query\)\{/.test(bankSrc));
  ok("비교 패널이 조회 함수를 쓰지 않는다",
    /function renderCompare\(\)\{[\s\S]{0,400}publishedFunction\(query\)/.test(bankSrc)
    && !/function renderCompare\(\)\{[\s\S]{0,400}client\.lookup/.test(bankSrc));
  ok("비교 패널도 검색어 길이 상한을 지킨다",
    /function publishedFunction[\s\S]{0,300}MAX_QUERY/.test(bankSrc));
  /* 폰 한 개는 실제 동작을 보여주는 자리라 그대로 조회 함수를 쓴다 */
  ok("폰은 그대로 조회 함수를 쓴다", /function search\(\)\{[\s\S]{0,300}client\.lookup\(query\)/.test(bankSrc));
  ok("두 화면이 무엇을 보여주는지 화면에 적혀 있다",
    bankSrc.includes("cmppurpose") && bankSrc.includes("실제 동작은 위 폰에서"));

  /* ---------------------------------------------------------------- */
  group("앱 디자인 컴포넌트 — 앱 화면과의 연결");

  ok("앱이 app-themes.js 를 읽어들인다", bankSrc.includes('src="./app-themes.js"'));
  ok("안내 카드를 직접 조립하지 않는다", !bankSrc.includes('h += \'<div class="guide">\''));
  ok("안내 카드를 앱 컴포넌트로 그린다", bankSrc.includes('AT.safe(appId, "guideCard", hit)'));
  ok("결과 행도 앱 컴포넌트로 그린다", bankSrc.includes('AT.safe(appId, "resultRow"'));
  ok("폰에 테마 클래스를 붙인다", bankSrc.includes('"phone theme-" + a.id'));
  /* 발표 모드가 body 클래스를 통째로 덮어쓰면 비교 패널 상태가 지워진다 */
  ok("발표 모드가 다른 body 클래스를 지우지 않는다",
    bankSrc.includes('classList.toggle("present"') && !bankSrc.includes('document.body.className = on'));
}

/* =========================================================================
   검사 건수가 문서로 번지지 않는지

   건수는 이 파일을 고칠 때마다 바뀐다. 문서마다 손으로 박아두면 검사를 더할
   때마다 전부 고쳐야 하고, 하나라도 빠뜨리면 문서끼리 숫자가 어긋난다.
   실제로 일곱 개 파일에 박혀 있어서 여섯 번 동기화했다.

   단일 기준은 prototype/router/README.md 다. 예외는 발표 슬라이드 표지
   한 곳으로, 발표에서 숫자로 말하는 자리라 남겼다.
   ========================================================================= */
{
  group("검사 건수 중복 방지");

  /* 「자동 검사 ...123건」과 「123개 항목」을 찾는다. 설문 25건처럼 다른 건수는 건드리지 않는다. */
  const COUNT = /자동\s*검사[^\n]{0,14}\d+\s*건|\d+\s*개 항목/;
  const GUARDED = [
    "README.md",
    "docs/B축_MVP_설계.md",
    "docs/발표_스피커노트.md",
    "docs/발표자료_구성안.md",
    "docs/평가리포트.md",
    "docs/원페이저_기획안.md"
  ];

  for (const rel of GUARDED) {
    const src = fs.readFileSync(new URL("../../" + rel, import.meta.url), "utf8");
    const m = src.match(COUNT);
    ok(rel + " 에 검사 건수를 적지 않는다" + (m ? " — 발견: " + JSON.stringify(m[0]) : ""), !m);
  }

  /* 단일 기준에는 반드시 있어야 한다 */
  const routerReadme = fs.readFileSync(new URL("./README.md", import.meta.url), "utf8");
  ok("라우터 README 에는 건수가 있다", COUNT.test(routerReadme));
  ok("라우터 README 가 단일 기준임을 밝힌다",
    routerReadme.includes("검사 건수의 단일 기준은 이 문서다"));

  /* 표지는 예외다 — 발표에서 숫자로 말하는 자리 */
  const cover = fs.readFileSync(new URL("../slides/Main.dc.html", import.meta.url), "utf8");
  ok("슬라이드 표지에는 건수가 있다", /자동검사\s*\d+건/.test(cover));
}

/* ---------- 결과 ---------- */
console.log("\n" + "-".repeat(52));
console.log("통과 " + pass + " · 실패 " + fail + " (총 " + (pass + fail) + "건)");
if (fail) {
  console.log("\n실패 항목");
  failures.forEach((f) => console.log("  - " + f));
}
process.exit(fail ? 1 : 0);

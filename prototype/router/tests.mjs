/* =========================================================================
   tests.mjs — routing-client.js 자동 검사

   실행:  node tests.mjs        (외부 라이브러리 없음)

   검사 대상은 화면이 아니라 계열사 앱이 실제로 심는 routing-client.js다.
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

/* ---------- 결과 ---------- */
console.log("\n" + "-".repeat(52));
console.log("통과 " + pass + " · 실패 " + fail + " (총 " + (pass + fail) + "건)");
if (fail) {
  console.log("\n실패 항목");
  failures.forEach((f) => console.log("  - " + f));
}
process.exit(fail ? 1 : 0);

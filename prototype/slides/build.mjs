/* =========================================================================
   build.mjs — 아홉 장의 소스에서 배포본 발표자료.html 을 만든다

   실행:  node build.mjs        (외부 라이브러리 없음)

   왜 스크립트로 만드는가
     소스(*.dc.html)와 배포본(발표자료.html)은 같은 내용을 두 벌 갖고 있다.
     손으로 양쪽을 맞추면 언젠가 갈라지고, 갈라진 뒤에는 어느 쪽이 맞는지
     알 수 없다. 발표에서 띄우는 것은 배포본이므로 그 사고는 발표 자리에서
     드러난다. 그래서 배포본은 손으로 고치지 않고 여기서 만든다.

   하는 일
     1) canvas.json 의 순서대로 각 소스의 <style> 과 .slide 마크업을 꺼낸다
     2) CSS 선택자에 #s0~#s8 을 붙여 슬라이드끼리 스타일이 섞이지 않게 한다
     3) 이미지를 base64 로 박아 단일 파일로 만든다 — 발표에 다른 파일도
        인터넷도 필요 없어야 한다
     4) 껍데기(리셋 · 인쇄 CSS · 키보드 내비게이션)를 씌워 내보낸다

   전제
     소스에 @media·@keyframes 같은 at-rule 이 없다. 규칙을 중괄호 단위로
     자르는 방식이라 at-rule 이 생기면 이 스크립트를 먼저 고쳐야 한다.
     빌드할 때 그런 규칙이 보이면 멈추고 알린다.
   ========================================================================= */
import fs from "node:fs";
import path from "node:path";

const DIR = new URL("./", import.meta.url);
const OUT = "발표자료.html";
const TITLE = "NH 인앱검색 담당 채널 안내 — 발표자료";

const read = (name) => fs.readFileSync(new URL("./" + name, DIR), "utf8");

/* ---------- 소스에서 꺼내기 ---------- */
function pickStyle(src, file) {
  const m = src.match(/<style>([\s\S]*?)<\/style>/);
  if (!m) throw new Error(file + " 에 <style> 이 없다");
  return m[1];
}

function pickSlide(src, file) {
  const start = src.indexOf('<div class="slide">');
  const end = src.indexOf("</x-dc>");
  if (start === -1 || end === -1 || end < start) throw new Error(file + " 에서 .slide 를 찾지 못했다");
  return src.slice(start, end).trimEnd();
}

/* ---------- CSS 에 슬라이드 범위를 씌우기 ---------- */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function splitRules(css, file) {
  const out = [];
  let i = 0;
  for (;;) {
    const open = css.indexOf("{", i);
    if (open === -1) break;
    const close = css.indexOf("}", open);
    if (close === -1) throw new Error(file + " 의 CSS 중괄호가 맞지 않는다");
    const sel = css.slice(i, open).trim();
    if (sel.startsWith("@")) {
      throw new Error(file + " 에 at-rule 이 있다 (" + sel + "). build.mjs 를 먼저 고쳐야 한다");
    }
    out.push({ sel, body: css.slice(open + 1, close).trim() });
    i = close + 1;
  }
  return out;
}

/* 껍데기가 이미 갖고 있는 전역 규칙은 버린다 */
const GLOBAL = new Set(["*", "html", "body", "html,body"]);

function scopeSelector(sel, id) {
  const s = sel.trim();
  if (GLOBAL.has(s.replace(/\s+/g, ""))) return null;
  /* :root 와 .slide 는 둘 다 슬라이드 상자 자신을 가리킨다 */
  if (s === ":root" || s === ".slide") return "#" + id;
  if (s.startsWith(".slide ")) return "#" + id + " " + s.slice(".slide ".length).trim();
  return "#" + id + " " + s;
}

function scopeCss(css, id, file) {
  const lines = [];
  for (const { sel, body } of splitRules(stripComments(css), file)) {
    const scoped = sel.split(",").map((s) => scopeSelector(s, id)).filter(Boolean);
    if (!scoped.length) continue;
    lines.push(scoped.join(", ") + "{" + body.replace(/\s*\n\s*/g, " ").trim() + "}");
  }
  return lines.join("\n");
}

/* ---------- 이미지를 파일 안으로 ---------- */
const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml" };

function inlineImages(html, file) {
  let bytes = 0;
  const out = html.replace(/src="\.\/images\/([^"]+)"/g, (_m, name) => {
    const rel = decodeURIComponent(name);
    const ext = path.extname(rel).toLowerCase();
    const mime = MIME[ext];
    if (!mime) throw new Error(file + " 의 " + rel + " 은 박을 수 없는 형식이다");
    const buf = fs.readFileSync(new URL("./images/" + rel, DIR));
    bytes += buf.length;
    return 'src="data:' + mime + ";base64," + buf.toString("base64") + '"';
  });
  return { html: out, bytes };
}

/* ---------- 껍데기 ---------- */
const SHELL_CSS = `  *{ box-sizing:border-box; }
  html,body{ margin:0; padding:0; height:100%; background:#000; overflow:hidden; }
  #stage{ position:fixed; inset:0; display:grid; place-items:center; }
  #deck{ width:1280px; height:720px; position:relative; transform-origin:center center; }
  .frame{ position:absolute; inset:0; display:none; }
  .frame.on{ display:block; }`;

const PRINT_CSS = `  @media print{
    html,body{ height:auto; overflow:visible; background:#fff; }
    #stage{ position:static; display:block; }
    #deck{ width:auto; height:auto; transform:none !important; }
    .frame{ position:relative; inset:auto; display:block !important; break-after:page; page-break-after:always; }
    .frame:last-child{ break-after:auto; page-break-after:auto; }
    @page{ size:1280px 720px; margin:0; }
  }`;

const NAV_JS = `(function(){
  var deck = document.getElementById("deck");
  var slides = Array.prototype.slice.call(deck.querySelectorAll(".frame"));
  var i = 0;

  function show(n){
    if (n < 0) n = 0;
    if (n > slides.length - 1) n = slides.length - 1;
    slides[i].classList.remove("on");
    i = n;
    slides[i].classList.add("on");
    try { location.replace("#" + (i + 1)); } catch (e) {}
  }

  function fit(){
    var k = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
    deck.style.transform = "scale(" + k + ")";
  }

  window.addEventListener("resize", fit);
  window.addEventListener("keydown", function(e){
    if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown"){ e.preventDefault(); show(i + 1); }
    else if (e.key === "ArrowLeft" || e.key === "PageUp"){ e.preventDefault(); show(i - 1); }
    else if (e.key === "Home"){ e.preventDefault(); show(0); }
    else if (e.key === "End"){ e.preventDefault(); show(slides.length - 1); }
  });
  document.getElementById("stage").addEventListener("click", function(){ show(i + 1); });

  var start = parseInt((location.hash || "").slice(1), 10);
  slides[0].classList.add("on");
  if (start >= 1 && start <= slides.length) show(start - 1);
  fit();
  deck.classList.add("ready");
})();`;

/* ---------- 조립 ---------- */
const canvas = JSON.parse(read("canvas.json"));
const files = canvas.artboards.map((a) => a.file);

const cssBlocks = [];
const frames = [];
let imgBytes = 0;

files.forEach((file, n) => {
  const id = "s" + n;
  const src = read(file);
  cssBlocks.push("/* ── " + file + " ── */\n" + scopeCss(pickStyle(src, file), id, file));

  let slide = pickSlide(src, file);
  slide = slide.replace('<div class="slide">', '<div class="slide" id="' + id + '">');
  const inl = inlineImages(slide, file);
  imgBytes += inl.bytes;
  frames.push('<div class="frame" data-idx="' + n + '">\n' + inl.html + "\n</div>");
});

const out = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${TITLE}</title>
<!-- 이 파일은 node build.mjs 로 만들어진다. 손으로 고치지 말고 *.dc.html 을 고친다. -->
<style>
${SHELL_CSS}

${cssBlocks.join("\n\n")}

${PRINT_CSS}
</style>
</head>
<body>

<div id="stage"><div id="deck">
${frames.join("\n\n")}
</div></div>
<script>
${NAV_JS}
</script>
</body>
</html>
`;

const target = new URL("./" + OUT, DIR);
const before = fs.existsSync(target) ? fs.statSync(target).size : 0;
fs.writeFileSync(target, out, "utf8");
/* out.length 는 문자 수라 한국어에서 실제 바이트와 다르다. 파일 크기로 센다. */
const after = fs.statSync(target).size;

const kb = (n) => (n / 1024).toFixed(0) + " KB";
console.log("슬라이드 " + files.length + "장 · 이미지 " + kb(imgBytes) + " 를 박았다");
console.log(OUT + "  " + kb(before) + " → " + kb(after));

/* =========================================================================
   build.mjs — 발표자료.html 에 이미지 열 장을 박아 단일 파일 배포본을 만든다

   실행:  node build.mjs        (외부 라이브러리 없음)
   결과:  발표자료_배포.html      이 파일 하나만 보내면 된다

   왜
     발표자료.html 은 옆 폴더 images/ 에서 PNG 를 읽는다. 파일 하나만 보내면
     받는 쪽에는 자리표시자만 뜬다. v1 이 그랬듯 이미지를 base64 로 본문에
     박으면 폴더도 서버도 인터넷도 없이 열린다.

   하는 일
     1) images/00.png ~ 09.png 를 읽어 data URI 로 바꾼다
     2) <script> 앞에 window.EMBED = {...} 를 끼워 넣는다. 껍데기는 EMBED 가
        있으면 그것을, 없으면 images/ 를 쓴다. 소스는 손대지 않는다
     3) 받는 쪽에는 서버가 없으므로 05장의 콘솔·앱 링크는 열리지 않는다.
        그 사실을 파일 머리 주석에 남긴다

   배포본은 손으로 고치지 않는다. 슬라이드가 바뀌면 images/ 를 갈고 다시 돌린다.
   ========================================================================= */
import fs from "node:fs";

const DIR = new URL("./", import.meta.url);
const SRC = "발표자료.html";
const OUT = "발표자료_배포.html";

const read = (name) => fs.readFileSync(new URL("./" + name, DIR));
const html = read(SRC).toString("utf8");

/* 1) 이미지 → data URI */
const embed = {};
let bytes = 0;
for (let i = 0; i < 10; i++) {
  const name = String(i).padStart(2, "0") + ".png";
  const buf = read("images/" + name);
  if (buf.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error(name + " 은 PNG 가 아니다");
  }
  embed[name] = "data:image/png;base64," + buf.toString("base64");
  bytes += buf.length;
}

/* 2) 첫 <script> 앞에 EMBED 를 끼운다. 껍데기의 로더가 이것을 먼저 본다 */
const at = html.indexOf("<script>");
if (at === -1) throw new Error(SRC + " 에 <script> 가 없다");
const note = `<!-- 배포본. node build.mjs 가 ${new Date().toISOString().slice(0, 10)} 에 만들었다.
     이미지 열 장이 안에 들어 있어 이 파일 하나로 열린다. 손으로 고치지 않는다.
     05장의 콘솔·앱 링크는 발표 컴퓨터의 로컬 서버를 가리키므로 받는 쪽에서는 열리지 않는다. -->\n`;
const inject = `<script>window.EMBED = ${JSON.stringify(embed)};</script>\n`;
const out = html.slice(0, at) + note + inject + html.slice(at);

fs.writeFileSync(new URL("./" + OUT, DIR), out, "utf8");

const size = Buffer.byteLength(out, "utf8");
console.log(`${OUT}  ${(size / 1024 / 1024).toFixed(2)} MB  (이미지 원본 ${(bytes / 1024 / 1024).toFixed(2)} MB, 열 장 내장)`);

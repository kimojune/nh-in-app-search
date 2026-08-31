/* =========================================================================
   app-themes.js — 계열사 앱이 자기 디자인으로 안내를 그리는 부분
   -------------------------------------------------------------------------
   라우터(routing-client.js)가 주는 것은 데이터뿐이다.

       { name, channels:[{id,name,role}], next }

   이 파일은 그 데이터를 "각 앱의 디자인 컴포넌트"로 바꾼다. 마크업과 클래스,
   스타일 전부 여기서 만든다. 라우터는 어느 앱이 어떻게 그리는지 알지 못한다.

   왜 앱마다 다르게 그리는가
     실측한 네 앱은 강조색·헤더 정렬·검색창 형태·결과 강조 방식이 서로 다르다.
     같은 그룹이지만 상호금융(콕뱅크)과 농협은행(올원뱅크·스마트뱅킹)이 별도
     법인이고 카드가 사업부문으로 또 갈린다. 측정값과 근거는
     docs/디자인_기준.md 에 있다.

     그래서 라우터가 UI를 내려보내지 않는다. 내려보내면 네 앱의 디자인 시스템과
     접근성 기준을 라우터가 전부 떠안게 된다. 이 파일이 그 판단의 실물이다.

   구조
     THEMES[appId]     디자인 토큰 (색·형태·정렬)
     RENDERERS[appId]  컴포넌트 (guideCard · sectionHeader · resultRow · emptyState)
     FALLBACK          렌더러가 없거나 깨졌을 때 쓰는 최소 구현
     css()             위 컴포넌트가 쓰는 스타일시트 전문
   ========================================================================= */
(function (global) {
  "use strict";

  /* routing-client 과 같은 규칙. 따옴표까지 바꿔 속성 안에서 빠져나가지 못하게 한다. */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /* =====================================================================
     디자인 토큰
     값의 출처는 prototype/slides/images/asis-*.jpg 픽셀 측정이다.
     측정 방법과 한계는 docs/디자인_기준.md 「측정 방법과 한계」.

     accent      실측값 그대로. 면·테두리에 쓴다
     accentText  본문 크기 텍스트용으로 어둡게 조정한 값.
                 실측값은 흰 배경 대비 4.5:1에 미달해 글자에 쓸 수 없다
     ===================================================================== */
  var THEMES = {
    allone: {
      label: "NH올원뱅크",
      accent: "#18983B",
      accentText: "#0F7A2E",
      soft: "#EAF6EC",
      searchStyle: "box-gray",
      headerAlign: "center",
      headerBack: "x",
      headTitle: "통합검색",
      chipStyle: "none",
      matchStyle: "underline",
      emptyStyle: "plain",
      /* 기기 껍데기 — 캡처에서 픽셀로 뽑은 값. 앱마다 다르다 */
      navBar: "light",
      navBarColor: "#FFFFFF",
      statusBar: "light",
      statusBarColor: "#FFFFFF",
      radius: "14px"
    },
    kok: {
      label: "NH콕뱅크",
      accent: "#0296A2",
      accentText: "#04707A",
      soft: "#E6F6F7",
      searchStyle: "pill-teal",
      headerAlign: "left",
      headerBack: "x",
      headTitle: "검색",
      chipStyle: "none",
      matchStyle: "plain",
      emptyStyle: "illust",
      /* 기기 껍데기 — 캡처에서 픽셀로 뽑은 값. 앱마다 다르다 */
      navBar: "light",
      navBarColor: "#FFFFFF",
      statusBar: "light",
      statusBarColor: "#FFFFFF",
      radius: "18px"
    },
    smart: {
      label: "NH스마트뱅킹",
      accent: "#229142",
      accentText: "#137031",
      soft: "#EAF5EC",
      searchStyle: "box-green",
      headerAlign: "left",
      headerBack: "x",
      headTitle: "검색",
      chipStyle: "filled-dark",
      chipActive: "#121212",
      matchStyle: "plain",
      emptyStyle: "plain",
      /* 기기 껍데기 — 캡처에서 픽셀로 뽑은 값. 앱마다 다르다 */
      navBar: "dark",
      navBarColor: "#343434",
      statusBar: "light",
      statusBarColor: "#FFFFFF",
      radius: "10px"
    },
    nhpay: {
      label: "NH Pay",
      accent: "#313E60",
      accentText: "#1F2942",
      link: "#2576E2",
      linkText: "#1A5CB8",
      soft: "#EEF2F9",
      searchStyle: "underline",
      headerAlign: "left",
      headerBack: "arrow",
      headTitle: "통합검색",
      chipStyle: "filled-navy",
      chipActive: "#313E60",
      matchStyle: "plain",
      emptyStyle: "plain",
      /* 기기 껍데기 — 캡처에서 픽셀로 뽑은 값. 앱마다 다르다 */
      navBar: "dark",
      navBarColor: "#1D1D1D",
      statusBar: "dark",
      statusBarColor: "#303030",
      radius: "0px"
    }
  };

  function roleCls(r) {
    return r === "완료" ? "done" : (r === "경유" ? "via" : "info");
  }

  /* =====================================================================
     컴포넌트
     각 앱이 같은 데이터를 자기 디자인 언어로 그린다. 함수 이름과 인자는
     같고 나오는 마크업이 다르다 — 그게 이 파일의 요점이다.
     ===================================================================== */
  var RENDERERS = {

    /* ---- NH올원뱅크 · 회색 박스 카드 · 채널명을 초록 밑줄 링크로 ---- */
    allone: {
      guideCard: function (hit) {
        var h = '<div class="gd gd-allone">';
        h += '<div class="gd-h">' + esc(hit.name) + '</div>';
        h += '<div class="gd-s">이 앱 검색 결과에는 담당 채널이 없어 안내를 함께 보여드립니다</div>';
        for (var i = 0; i < hit.channels.length; i++) {
          h += this.channelRow(hit.channels[i]);
        }
        h += '<div class="gd-next">다음 행동 &middot; ' + esc(hit.next) + '</div>';
        return h + '</div>';
      },
      /* 앱의 결과 표현을 그대로 따른다 — 브레드크럼 뒤 마지막 조각이 초록 밑줄 */
      channelRow: function (ch) {
        return '<div class="gd-r"><span class="gd-pre">담당 채널 &gt;</span>'
             + '<a class="gd-lnk">' + esc(ch.name) + '</a>'
             + this.roleBadge(ch.role) + '</div>';
      },
      roleBadge: function (role) {
        return '<span class="gd-b ' + roleCls(role) + '">' + esc(role) + '</span>';
      },
      sectionHeader: function (s) {
        return '<div class="sh sh-allone">' + esc(s.label) + ' <em>' + Number(s.count) + '건</em></div>';
      },
      resultRow: function (rowHtml) {
        return '<div class="rr rr-allone">' + rowHtml + '</div>';
      },
      emptyState: function () {
        return '<div class="es es-allone">결과가 없습니다.</div>';
      }
    },

    /* ---- NH콕뱅크 · 청록 알약 · 채널을 알약 카드로 · 마스코트 자리 ---- */
    kok: {
      guideCard: function (hit) {
        var h = '<div class="gd gd-kok">';
        h += '<div class="gd-h">' + esc(hit.name) + '<span class="gd-tag">담당 안내</span></div>';
        h += '<div class="gd-s">콕뱅크에서는 처리되지 않아요. 아래 채널을 확인해 주세요.</div>';
        for (var i = 0; i < hit.channels.length; i++) {
          h += this.channelRow(hit.channels[i]);
        }
        h += '<div class="gd-next">다음 행동 &middot; ' + esc(hit.next) + '</div>';
        return h + '</div>';
      },
      channelRow: function (ch) {
        return '<div class="gd-p"><span class="gd-pn">' + esc(ch.name) + '</span>'
             + this.roleBadge(ch.role) + '</div>';
      },
      roleBadge: function (role) {
        return '<span class="gd-pb ' + roleCls(role) + '">' + esc(role) + '</span>';
      },
      sectionHeader: function (s) {
        return '<div class="sh sh-kok">' + esc(s.label) + ' <em>' + Number(s.count) + '</em></div>';
      },
      resultRow: function (rowHtml) {
        return '<div class="rr rr-kok">' + rowHtml + '</div>';
      },
      /* 실제 앱은 캐릭터 일러스트를 쓴다. 상표 요소를 넣지 않기로 해서
         중립 도형으로 자리만 잡고 캡션으로 사실을 밝힌다 — docs/디자인_기준.md */
      emptyState: function (sec) {
        var h = '<div class="es es-kok">';
        h += '<div class="es-mark" aria-hidden="true"><span class="es-bubble"></span>'
           + '<span class="es-body"></span><span class="es-lens"></span></div>';
        h += '<div class="es-msg">' + (sec && sec.msg ? sec.msg : "검색 결과가 없어요.") + '</div>';
        h += '<div class="es-cap">실제 앱에는 이 자리에 캐릭터 일러스트가 있습니다</div>';
        if (sec && sec.sugg && sec.sugg.length) {
          h += '<div class="es-lab">추천검색어</div><div class="es-sugg">';
          for (var i = 0; i < sec.sugg.length; i++) {
            h += '<span class="dead" title="(임시) 실제 앱 화면 재현용 · 동작하지 않음">'
               + esc(sec.sugg[i]) + '</span>';
          }
          h += '</div>';
        }
        return h + '</div>';
      }
    },

    /* ---- NH스마트뱅킹 · 초록 테두리 박스 · 채널을 구분선 목록으로 ---- */
    smart: {
      guideCard: function (hit) {
        var h = '<div class="gd gd-smart">';
        h += '<div class="gd-h">' + esc(hit.name) + '</div>';
        h += '<div class="gd-s">검색 결과에 담당 채널이 없어 안내를 표시했습니다</div>';
        h += '<div class="gd-list">';
        for (var i = 0; i < hit.channels.length; i++) {
          h += this.channelRow(hit.channels[i]);
        }
        h += '</div>';
        h += '<div class="gd-next"><b>다음 행동</b> ' + esc(hit.next) + '</div>';
        return h + '</div>';
      },
      channelRow: function (ch) {
        return '<div class="gd-li">' + this.roleBadge(ch.role)
             + '<span class="gd-ln">' + esc(ch.name) + '</span></div>';
      },
      /* 활성 필터칩과 같은 검정 필 — 이 앱에서 강조는 검정이 맡는다 */
      roleBadge: function (role) {
        return '<span class="gd-sb ' + roleCls(role) + '">' + esc(role) + '</span>';
      },
      sectionHeader: function (s) {
        return '<div class="sh sh-smart">' + esc(s.label) + ' (총 ' + Number(s.count) + '건)</div>';
      },
      resultRow: function (rowHtml) {
        return '<div class="rr rr-smart">' + rowHtml + '</div>';
      },
      emptyState: function () {
        return '<div class="es es-smart">결과가 없습니다.</div>';
      }
    },

    /* ---- NH Pay · 카드가 아니라 리스트 섹션 · 파랑 링크 · 전체보기 어피던스 ---- */
    nhpay: {
      guideCard: function (hit) {
        var h = '<div class="gd gd-pay">';
        /* 앱의 결과 표현을 따른다 — 섹션 제목 + 건수 + 전체보기 */
        h += '<div class="gd-sec"><span class="gd-st">' + esc(hit.name) + '</span>'
           + '<em>' + hit.channels.length + '</em>'
           + '<span class="gd-all">전체보기 &rsaquo;</span></div>';
        for (var i = 0; i < hit.channels.length; i++) {
          h += this.channelRow(hit.channels[i]);
        }
        h += '<div class="gd-next"><span class="gd-nl">다음 행동</span> ' + esc(hit.next) + '</div>';
        return h + '</div>';
      },
      channelRow: function (ch) {
        return '<div class="gd-pr"><span class="gd-pt">' + esc(ch.name) + '</span>'
             + this.roleBadge(ch.role) + '</div>';
      },
      roleBadge: function (role) {
        return '<span class="gd-nb ' + roleCls(role) + '">' + esc(role) + '</span>';
      },
      sectionHeader: function (s) {
        return '<div class="sh sh-pay">' + esc(s.label) + ' <em>' + Number(s.count) + '</em>'
             + '<span class="sh-all">전체보기 &rsaquo;</span></div>';
      },
      resultRow: function (rowHtml) {
        return '<div class="rr rr-pay">' + rowHtml + '</div>';
      },
      emptyState: function () {
        return '<div class="es es-pay">결과가 없습니다.</div>';
      }
    }
  };

  /* =====================================================================
     최소 구현
     테마가 없는 앱이 붙었거나 렌더러가 예외를 던졌을 때 쓴다.
     안내가 못 뜨더라도 검색은 계속 동작해야 한다 — routing-client 의
     실패 방어와 같은 원칙이다.
     ===================================================================== */
  var FALLBACK = {
    guideCard: function (hit) {
      var h = '<div class="gd gd-base"><div class="gd-h">' + esc(hit.name) + '</div>';
      for (var i = 0; i < hit.channels.length; i++) {
        h += '<div class="gd-r">' + esc(hit.channels[i].name)
           + ' <span class="gd-b ' + roleCls(hit.channels[i].role) + '">'
           + esc(hit.channels[i].role) + '</span></div>';
      }
      return h + '<div class="gd-next">' + esc(hit.next) + '</div></div>';
    },
    channelRow: function (ch) { return '<div class="gd-r">' + esc(ch.name) + '</div>'; },
    roleBadge: function (role) { return '<span class="gd-b">' + esc(role) + '</span>'; },
    sectionHeader: function (s) {
      return '<div class="sh sh-base">' + esc(s.label) + ' ' + Number(s.count) + '건</div>';
    },
    resultRow: function (rowHtml) { return '<div class="rr rr-base">' + rowHtml + '</div>'; },
    emptyState: function () { return '<div class="es es-base">결과가 없습니다.</div>'; }
  };

  var IDS = ["allone", "kok", "smart", "nhpay"];

  function themeFor(id) { return THEMES[id] || THEMES.allone; }
  function rendererFor(id) { return RENDERERS[id] || FALLBACK; }

  /* 렌더러가 예외를 던져도 화면 전체가 멈추지 않게 한다.
     안내만 최소 형태로 떨어지고 as-is 결과는 그대로 그려진다. */
  function safe(id, fnName, arg) {
    var r = rendererFor(id);
    try {
      if (typeof r[fnName] !== "function") throw new Error("no " + fnName);
      var out = r[fnName](arg);
      if (typeof out !== "string") throw new Error("not a string");
      return out;
    } catch (e) {
      try { return FALLBACK[fnName](arg); } catch (e2) { return ""; }
    }
  }

  /* =====================================================================
     스타일시트
     컴포넌트가 쓰는 클래스를 여기서 전부 정의한다. 마크업과 스타일이 한
     파일에 있어야 "이 앱의 컴포넌트"라고 말할 수 있다.
     ===================================================================== */
  function css() {
    var t = THEMES, s = "";

    /* ---- 폰 껍데기: 앱마다 헤더 정렬과 검색창 형태가 다르다 ---- */
    s += '.phone.theme-allone .apphead{justify-content:center;position:relative}';
    s += '.phone.theme-allone .apphead .x{position:absolute;right:14px;top:8px}';
    s += '.phone.theme-nhpay .apphead{gap:8px;justify-content:flex-start}';
    s += '.phone.theme-nhpay .apphead .x{margin-left:auto}';
    s += '.apphead .back{font-size:19px;font-weight:400;color:#1b1d22;line-height:1;'
       + 'border:0;background:none;padding:0 2px 0 0;cursor:default;font-family:inherit}';

    s += '.phone.theme-allone .sbox{border:1px solid #dcdfe4;border-radius:' + t.allone.radius + '}';
    s += '.phone.theme-kok .sbox{border:1.6px solid ' + t.kok.accent + ';border-radius:999px;padding:10px 14px}';
    s += '.phone.theme-smart .sbox{border:1.6px solid ' + t.smart.accent + ';border-radius:' + t.smart.radius + '}';
    s += '.phone.theme-nhpay .sbox{border:0;border-bottom:1.4px solid #c9ccd2;border-radius:0;padding:8px 2px}';

    s += '.phone.theme-smart .chip.on{background:' + t.smart.chipActive + ';color:#fff}';
    s += '.phone.theme-nhpay .chip{border-radius:999px;background:#fff;border:1px solid #d8dbe1;color:#4b5361}';
    s += '.phone.theme-nhpay .chip.on{background:' + t.nhpay.chipActive + ';color:#fff;'
       + 'border-color:' + t.nhpay.chipActive + '}';

    /* ---- 기기 껍데기: 상태바와 하단 내비게이션 ----
       안드로이드는 앱이 두 바의 색을 정한다. 실측이 앱마다 달라서 테마에 담았다. */
    s += '.phone.theme-allone .statusbar{background:#FFFFFF;color:#111}';
    s += '.phone.theme-allone .batt{background:#111;color:#fff}';
    s += '.phone.theme-allone .navbar{background:#FFFFFF;color:#3d434d}';
    s += '.phone.theme-kok .statusbar{background:#FFFFFF;color:#111}';
    s += '.phone.theme-kok .batt{background:#111;color:#fff}';
    s += '.phone.theme-kok .navbar{background:#FFFFFF;color:#3d434d}';
    s += '.phone.theme-smart .statusbar{background:#FFFFFF;color:#111}';
    s += '.phone.theme-smart .batt{background:#111;color:#fff}';
    s += '.phone.theme-smart .navbar{background:#343434;color:#e8eaee}';
    s += '.phone.theme-nhpay .statusbar{background:#303030;color:#f2f3f5}';
    s += '.phone.theme-nhpay .batt{background:#e8eaee;color:#1d1d1d}';
    s += '.phone.theme-nhpay .navbar{background:#1D1D1D;color:#e8eaee}';

    /* ---- 안내 카드 공통 골격 ---- */
    s += '.gd{margin:10px 0 14px}';
    s += '.gd-h{font-size:13.5px;font-weight:800;letter-spacing:-.4px;line-height:1.4}';
    s += '.gd-s{font-size:11.5px;letter-spacing:-.25px;margin:3px 0 10px;color:#6b7280}';
    s += '.gd-next{font-size:11.5px;letter-spacing:-.25px;margin-top:9px;line-height:1.5;color:#5c6b63}';
    s += '.gd-b,.gd-pb,.gd-sb,.gd-nb{font-size:10px;font-weight:800;padding:2px 7px;border-radius:999px;'
       + 'margin-left:auto;flex:0 0 auto;white-space:nowrap}';

    /* ---- 올원뱅크: 회색 박스 + 초록 밑줄 링크 ---- */
    s += '.gd-allone{border:1px solid #dcdfe4;border-radius:' + t.allone.radius + ';padding:13px;background:#fff}';
    s += '.gd-allone .gd-r{display:flex;align-items:baseline;gap:6px;font-size:12.5px;'
       + 'letter-spacing:-.3px;color:#3d434d;padding:7px 0;border-bottom:1px solid #f0f1f3}';
    s += '.gd-allone .gd-r:last-of-type{border-bottom:0}';
    s += '.gd-allone .gd-pre{white-space:nowrap;color:#6b7280;flex:0 0 auto}';
    s += '.gd-allone .gd-lnk{min-width:0;word-break:keep-all}';
    s += '.gd-allone .gd-lnk{color:' + t.allone.accentText + ';text-decoration:underline;font-weight:700}';
    s += '.gd-allone .gd-b{background:#eef0f3;color:#5a6169}';
    s += '.gd-allone .gd-b.done{background:' + t.allone.soft + ';color:' + t.allone.accentText + '}';

    /* ---- 콕뱅크: 청록 알약 ---- */
    s += '.gd-kok{border:1.4px solid ' + t.kok.accent + ';background:' + t.kok.soft + ';'
       + 'border-radius:' + t.kok.radius + ';padding:14px}';
    s += '.gd-kok .gd-h{display:flex;align-items:flex-start;gap:7px;color:#163234}';
    s += '.gd-kok .gd-h>span:first-child{min-width:0}';
    s += '.gd-kok .gd-tag{font-size:9.5px;font-weight:800;background:' + t.kok.accent + ';color:#fff;'
       + 'padding:3px 8px;border-radius:999px;letter-spacing:0;white-space:nowrap;flex:0 0 auto;'
       + 'margin-left:auto;line-height:1.3}';
    s += '.gd-kok .gd-s{color:#3f6a6e}';
    s += '.gd-kok .gd-p{display:flex;align-items:center;gap:8px;background:#fff;'
       + 'border:1px solid #bfe3e6;border-radius:999px;padding:9px 14px;margin-bottom:7px}';
    s += '.gd-kok .gd-pn{font-size:12.5px;font-weight:700;letter-spacing:-.3px;'
       + 'line-height:1.35;min-width:0;word-break:keep-all}';
    s += '.gd-kok .gd-pb{background:' + t.kok.soft + ';color:' + t.kok.accentText + '}';
    s += '.gd-kok .gd-pb.info{background:#eef0f3;color:#5a6169}';
    s += '.gd-kok .gd-next{color:#3f6a6e}';

    /* ---- 스마트뱅킹: 초록 테두리 박스 + 검정 배지 ---- */
    s += '.gd-smart{border:1.4px solid ' + t.smart.accent + ';border-radius:' + t.smart.radius + ';'
       + 'padding:12px 13px;background:#fff}';
    s += '.gd-smart .gd-list{border-top:1px solid #edeff2}';
    s += '.gd-smart .gd-li{display:flex;align-items:center;gap:9px;padding:8px 0;'
       + 'border-bottom:1px solid #edeff2}';
    s += '.gd-smart .gd-ln{font-size:12.5px;font-weight:700;letter-spacing:-.3px;'
       + 'min-width:0;word-break:keep-all}';
    s += '.gd-smart .gd-sb{margin-left:0;background:#121212;color:#fff}';
    s += '.gd-smart .gd-sb.via{background:#4b5361}';
    s += '.gd-smart .gd-sb.info{background:#eef0f3;color:#4b5361}';
    s += '.gd-smart .gd-next{color:#3d434d}';
    s += '.gd-smart .gd-next b{color:' + t.smart.accentText + '}';

    /* ---- NH Pay: 카드가 아니라 리스트 섹션 ---- */
    s += '.gd-pay{border-top:1px solid #e7e9ee;border-bottom:1px solid #e7e9ee;padding:4px 0 10px}';
    s += '.gd-pay .gd-sec{display:flex;align-items:center;font-size:12.5px;font-weight:800;'
       + 'letter-spacing:-.3px;color:#4b5361;padding:9px 0 6px}';
    s += '.gd-pay .gd-sec em{color:' + t.nhpay.linkText + ';font-style:normal;margin-left:5px;flex:0 0 auto}';
    s += '.gd-pay .gd-st{min-width:0;word-break:keep-all}';
    s += '.gd-pay .gd-all{margin-left:auto;font-size:11.5px;font-weight:700;color:#9aa1ad}';
    s += '.gd-pay .gd-pr{display:flex;align-items:center;gap:8px;padding:8px 0;'
       + 'border-top:1px solid #f2f3f6}';
    s += '.gd-pay .gd-pt{font-size:13px;font-weight:700;letter-spacing:-.3px;'
       + 'color:' + t.nhpay.linkText + ';min-width:0;word-break:keep-all}';
    s += '.gd-pay .gd-nb{border:1px solid ' + t.nhpay.accent + ';color:' + t.nhpay.accentText + ';'
       + 'background:#fff;border-radius:4px}';
    s += '.gd-pay .gd-nb.info{border-color:#c9ccd2;color:#6b7280}';
    s += '.gd-pay .gd-next{color:#5a6169;margin-top:8px}';
    s += '.gd-pay .gd-nl{font-weight:800;color:' + t.nhpay.accentText + '}';

    /* ---- 최소 구현 ---- */
    s += '.gd-base{border:1px solid #dcdfe4;border-radius:10px;padding:12px;background:#fff}';
    s += '.gd-base .gd-r{display:flex;align-items:center;font-size:12.5px;padding:6px 0}';
    s += '.gd-base .gd-b{background:#eef0f3;color:#5a6169}';

    /* ---- 섹션 머리글 ---- */
    s += '.sh{font-size:12.5px;font-weight:700;letter-spacing:-.3px;margin:6px 0 8px;color:#3d434d}';
    s += '.sh em{font-style:normal}';
    s += '.sh-allone em{color:' + t.allone.accentText + '}';
    s += '.sh-kok em{color:' + t.kok.accentText + '}';
    s += '.sh-smart{font-weight:800;color:#16181d}';
    s += '.sh-pay{display:flex;align-items:center}';
    s += '.sh-pay em{color:' + t.nhpay.linkText + ';margin-left:5px}';
    s += '.sh-pay .sh-all{margin-left:auto;font-size:11.5px;font-weight:700;color:#9aa1ad}';

    /* ---- 결과 행 ---- */
    s += '.rr{font-size:12.5px;line-height:1.5;letter-spacing:-.3px;color:#3d434d;padding:8px 0}';
    s += '.rr-allone{border-bottom:1px solid #f0f1f3}';
    s += '.rr-allone .g{color:' + t.allone.accentText + ';text-decoration:underline}';
    s += '.rr-kok{border-bottom:1px solid #eef4f4}';
    s += '.rr-kok .g{color:' + t.kok.accentText + '}';
    s += '.rr-smart{border-bottom:1px dashed #eef0f3}';
    s += '.rr-smart .g{color:' + t.smart.accentText + '}';
    s += '.rr-pay{border-bottom:1px solid #f2f3f6}';
    s += '.rr-pay .g{color:' + t.nhpay.linkText + '}';
    s += '.rr-base{border-bottom:1px dashed #eef0f3}';

    /* ---- 빈 상태 ---- */
    s += '.es{font-size:12.5px;color:#9aa1ad;padding:14px 0}';
    s += '.es-kok{text-align:center;padding:22px 0 10px;color:#163234}';
    s += '.es-kok .es-mark{position:relative;width:74px;height:74px;margin:0 auto 12px}';
    s += '.es-kok .es-body{position:absolute;left:9px;top:22px;width:56px;height:50px;'
       + 'background:#eef1f2;border:1.5px solid #d3dcdd;border-radius:28px 28px 20px 20px}';
    s += '.es-kok .es-bubble{position:absolute;left:24px;top:0;width:26px;height:20px;'
       + 'background:#f6f8f8;border:1.5px solid #d3dcdd;border-radius:7px}';
    s += '.es-kok .es-lens{position:absolute;right:10px;top:36px;width:20px;height:20px;'
       + 'border:2.5px solid ' + t.kok.accent + ';border-radius:50%}';
    s += '.es-kok .es-msg{font-size:13.5px;font-weight:800;letter-spacing:-.4px;line-height:1.5}';
    s += '.es-kok .es-cap{font-size:10.5px;color:#9aa1ad;margin-top:7px;letter-spacing:-.2px}';
    s += '.es-kok .es-lab{font-size:11.5px;color:#8b93a1;text-align:left;margin:18px 0 8px;font-weight:700}';
    s += '.es-kok .es-sugg{display:flex;gap:7px;flex-wrap:wrap}';
    s += '.es-kok .es-sugg span{font-size:11.5px;border:1px solid #d5dcdd;border-radius:999px;'
       + 'padding:7px 13px;color:#4b5361;background:#fff}';

    /* ---- 미노출 사유 (관찰자용 · 발표 모드에서 숨는다) ---- */
    s += '.suppnote{border:1px dashed #cbd2dc;border-radius:12px;background:#fafbfc;padding:12px;'
       + 'margin:10px 0 14px;font-size:11.5px;color:#6b7280;letter-spacing:-.3px;line-height:1.55}';
    s += '.suppnote b{color:#3d434d}';

    return s;
  }

  global.AppThemes = {
    ids: IDS,
    themes: THEMES,
    renderers: RENDERERS,
    fallback: FALLBACK,
    themeFor: themeFor,
    rendererFor: rendererFor,
    safe: safe,
    css: css,
    esc: esc,
    roleCls: roleCls
  };
})(typeof window !== "undefined" ? window : globalThis);

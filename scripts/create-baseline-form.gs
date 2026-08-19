// NH 카드 찾기 베이스라인 테스트 — 구글폼 자동 생성 스크립트
// 사용법: script.google.com 에서 새 프로젝트 만들고 이 파일 내용을 통째로 붙여넣은 뒤
// buildForm 함수를 실행한다 (첫 실행 시 Drive/Forms 권한 승인 필요).
// 실행 후 로그(보기 > 로그)에서 편집 링크와 응답(배포) 링크를 확인한다.
// 참고 문서: docs/베이스라인테스트_진행안.md, docs/NH앱4개_카드검색_as-is결과.md

var DRIVE_FOLDER_ID = '1_78Y57oD-fqPgRBus06YHUwX7XcH_H_j'; // 업로드한 "스크린샷" 폴더 ID

function buildForm() {
  var root = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  var form = FormApp.create('NH 카드 찾기 베이스라인 테스트');
  form.setDescription(
    '안녕하세요! 저는 취업 준비 중에 개인 포트폴리오 프로젝트를 진행하고 있어요. ' +
    'NH농협 앱들을 쓸 때(안 써보신 분도 괜찮아요!) 특정 기능을 찾다가 얼마나 헤매는지 궁금해서 짧은 설문을 만들었습니다.\n\n' +
    '정답 맞히는 문제 전혀 아니고, 그냥 "나라면 이렇게 할 것 같다"를 편하게 답해주시면 돼요. 3분이면 끝나요!\n\n' +
    '자, 이런 상황이라고 상상해볼게요 — 대중교통 요금을 할인·환급받을 수 있는 카드가 있다는 얘기를 듣고, ' +
    '그 카드를 NH농협 앱에서 만들어보려고 합니다. NH농협 앱이 몇 개 있는데, 그중 하나를 골라서 찾아볼게요. ' +
    '다음 화면을 보기 전에, 딱 떠오르는 대로 답해주세요 (미리 검색해보지 마시고요 😊).'
  );
  form.setConfirmationMessage('답변해주셔서 정말 감사합니다! 실제로 어떻게 헤매시는지 알게 돼서 큰 도움이 됐어요 🙏');
  form.setProgressBar(true);

  // ---- Pass 1: 모든 섹션(페이지 나누기)을 최종 순서대로 먼저 생성 ----
  // (분기 대상이 항상 뒤쪽 섹션이라, 참조할 객체를 미리 다 만들어둔다)
  var s = {};
  s.nhExp      = form.addPageBreakItem().setTitle('NH 앱 사용 경험');
  s.try1A      = form.addPageBreakItem().setTitle('카드 찾기 (1차 시도)');
  s.try1B      = form.addPageBreakItem().setTitle('카드 찾기 (1차 시도)');
  s.res1_smart = form.addPageBreakItem().setTitle('NH스마트뱅킹에서 찾아보기');
  s.res1_cok   = form.addPageBreakItem().setTitle('NH콕뱅크에서 찾아보기');
  s.res1_pay   = form.addPageBreakItem().setTitle('NHPAY에서 찾아보기');
  s.res1_all   = form.addPageBreakItem().setTitle('NH올원뱅크에서 찾아보기');
  s.afterFail  = form.addPageBreakItem().setTitle('다음엔 어떻게 하시겠어요?');
  s.try2       = form.addPageBreakItem().setTitle('다른 앱 시도');
  s.end        = form.addPageBreakItem().setTitle('마지막으로');

  // ---- 도우미 ----

  // 섹션(페이지 나누기) 바로 뒤에 순서대로 아이템을 끼워 넣는다.
  function chain(pageBreak) {
    var cursor = pageBreak;
    return {
      add: function (builderFn) {
        var item = builderFn();
        form.moveItem(item.getIndex(), cursor.getIndex() + 1);
        cursor = item;
        return item;
      }
    };
  }

  function imageBlob(subfolder, filename) {
    var subIter = root.getFoldersByName(subfolder);
    if (!subIter.hasNext()) throw new Error('폴더를 찾을 수 없음: ' + subfolder);
    var sub = subIter.next();
    var fileIter = sub.getFilesByName(filename);
    if (!fileIter.hasNext()) throw new Error('파일을 찾을 수 없음: ' + subfolder + '/' + filename);
    return fileIter.next().getBlob();
  }

  // 앱별 결과 섹션 하나를 채운다. "찾으셨나요" 답에 따라 마무리/실패후선택으로 분기.
  // 1차든 2차든(심지어 3차든) 같은 앱을 다시 시도하면 이 섹션으로 그대로 돌아온다 —
  // 화면은 어차피 똑같은 스크린샷이라 1차/2차용을 따로 만들 필요가 없다.
  // (이미지마다 반복 질문을 넣으면 지루해지므로, 화면들을 먼저 다 보여주고 마지막에 한 번만 묻는다)
  function addResultSection(pageBreak, appLabel, shots) {
    var c = chain(pageBreak);
    shots.forEach(function (shot) {
      c.add(function () {
        return form.addImageItem()
          .setTitle(appLabel + ' — "' + shot.term + '" 검색 결과')
          .setImage(imageBlob(shot.subfolder, shot.filename));
      });
    });
    c.add(function () {
      var mc = form.addMultipleChoiceItem()
        .setTitle('위 화면들을 보고, 결국 이 앱에서 카드를 찾으셨나요?')
        .setRequired(true);
      mc.setChoices([
        mc.createChoice('예', s.end),
        mc.createChoice('아니오', s.afterFail)
      ]);
      return mc;
    });
  }

  // ---- 앱별 스크린샷 매핑 (2026-08-18 as-is 조사에서 확인된 실제 파일명) ----
  var SHOTS = {
    smart: [ // 경기패스카드 결과 화면은 캡처 누락 (자동완성 화면만 존재) — 3장만 사용
      { term: '카드발급',     subfolder: 'NH스마트뱅킹', filename: 'Screenshot_20260818_131342_NH.jpg' },
      { term: '카드신청',     subfolder: 'NH스마트뱅킹', filename: 'Screenshot_20260818_131355_NH.jpg' },
      { term: 'K-패스카드',   subfolder: 'NH스마트뱅킹', filename: 'Screenshot_20260818_160503_NH.jpg' }
    ],
    cok: [
      { term: '경기패스카드', subfolder: 'NH콕뱅크', filename: 'Screenshot_20260818_131441_NH.jpg' },
      { term: '카드발급',     subfolder: 'NH콕뱅크', filename: 'Screenshot_20260818_131450_NH.jpg' },
      { term: '카드신청',     subfolder: 'NH콕뱅크', filename: 'Screenshot_20260818_131644_NH.jpg' },
      { term: 'K-패스카드',   subfolder: 'NH콕뱅크', filename: 'Screenshot_20260818_160422_NH.jpg' }
    ],
    pay: [
      { term: '경기패스카드', subfolder: 'NHPAY', filename: 'Screenshot_20260818_122110_NH pay.jpg' },
      { term: '카드발급',     subfolder: 'NHPAY', filename: 'Screenshot_20260818_122121_NH pay.jpg' },
      { term: '카드신청',     subfolder: 'NHPAY', filename: 'Screenshot_20260818_122135_NH pay.jpg' },
      { term: 'K-패스카드',   subfolder: 'NHPAY', filename: 'Screenshot_20260818_161107_NH pay.jpg' }
    ],
    all1: [
      { term: '경기패스카드', subfolder: 'NH올원뱅크', filename: 'Screenshot_20260818_131721_NH.jpg' },
      { term: '카드발급',     subfolder: 'NH올원뱅크', filename: 'Screenshot_20260818_131852_NH.jpg' },
      { term: '카드신청',     subfolder: 'NH올원뱅크', filename: 'Screenshot_20260818_131900_NH.jpg' },
      { term: 'K-패스카드',   subfolder: 'NH올원뱅크', filename: 'Screenshot_20260818_160951_NH.jpg' }
    ]
  };

  // ================= Pass 2: 섹션별 내용 채우기 =================

  // 1. NH 경험 확인
  (function () {
    var mc = form.addMultipleChoiceItem()
      .setTitle('NH농협 앱을 평소에 쓰시나요?')
      .setRequired(true);
    mc.setChoices([
      mc.createChoice('예', s.try1A),
      mc.createChoice('아니오', s.try1B)
    ]);
    form.moveItem(mc.getIndex(), s.nhExp.getIndex() + 1);
  })();

  // 2. 1차 시도 — 경험자
  (function () {
    var c = chain(s.try1A);
    c.add(function () {
      var mc = form.addMultipleChoiceItem()
        .setTitle('카드를 찾으려면 어느 NH 앱을 여시겠어요?')
        .setRequired(true);
      mc.setChoices([
        mc.createChoice('NH스마트뱅킹', s.res1_smart),
        mc.createChoice('NH콕뱅크', s.res1_cok),
        mc.createChoice('NHPAY', s.res1_pay),
        mc.createChoice('NH올원뱅크', s.res1_all)
      ]);
      return mc;
    });
    c.add(function () {
      return form.addTextItem().setTitle('왜 그 앱을 고르셨나요?');
    });
    c.add(function () {
      return form.addTextItem()
        .setTitle('그 앱에서 검색해본다면 뭐라고 입력할 것 같아요? 실제로 쓸 만한 단어 그대로 적어주세요.')
        .setRequired(true);
    });
  })();

  // 3. 1차 시도 — 비경험자 (앱스토어 소개 노출)
  (function () {
    var c = chain(s.try1B);
    c.add(function () {
      var mc = form.addMultipleChoiceItem()
        .setTitle('카드를 찾으려면 어느 NH 앱을 여시겠어요? (앱스토어 소개를 참고하세요)')
        .setRequired(true);
      mc.setChoices([
        mc.createChoice('NH스마트뱅킹 — "뱅킹에서 자산관리까지! NH스마트뱅킹으로 한 번에 편하게!"', s.res1_smart),
        mc.createChoice('NH콕뱅크 — "금융, 생활편의, 영농정보, 농축산물 쇼핑 서비스를 ONE-STOP으로 이용할 수 있는 농협상호금융의 모바일뱅크입니다."', s.res1_cok),
        mc.createChoice('NHPAY — "생활을 즐겁게, 페이를 새롭게! 모든 생활에서 고객님과 함께할 NH pay를 지금 바로 경험해보세요."', s.res1_pay),
        mc.createChoice('NH올원뱅크 — "당신을 위한 모든 금융과 혜택이 한 곳에! 농협은행 대표 플랫폼, NH올원뱅크를 만나 보세요!"', s.res1_all)
      ]);
      return mc;
    });
    c.add(function () {
      return form.addTextItem().setTitle('왜 그 앱을 고르셨나요?');
    });
    c.add(function () {
      return form.addTextItem()
        .setTitle('그 앱에서 검색해본다면 뭐라고 입력할 것 같아요? 실제로 쓸 만한 단어 그대로 적어주세요.')
        .setRequired(true);
    });
  })();

  // 4~7. 앱별 결과 (1차든 2차든 이 4개 섹션을 그대로 재사용)
  addResultSection(s.res1_smart, 'NH스마트뱅킹', SHOTS.smart);
  addResultSection(s.res1_cok,   'NH콕뱅크',     SHOTS.cok);
  addResultSection(s.res1_pay,   'NHPAY',        SHOTS.pay);
  addResultSection(s.res1_all,   'NH올원뱅크',   SHOTS.all1);
  s.res1_smart.setHelpText('경기패스카드 검색 결과 캡처가 누락되어 3개 화면만 제시합니다.');

  // 8. 실패 후 선택
  (function () {
    var c = chain(s.afterFail);
    c.add(function () {
      var mc = form.addMultipleChoiceItem()
        .setTitle('그럼 어떻게 하시겠어요?')
        .setRequired(true);
      mc.setChoices([
        mc.createChoice('다른 NH 앱을 열어본다', s.try2),
        mc.createChoice('구글 등 외부에서 검색한다', s.end),
        mc.createChoice('포기한다', s.end)
      ]);
      return mc;
    });
  })();

  // 9. 다른 앱 선택 (같은 결과 섹션 4~7로 그대로 돌아간다 — 화면이 똑같으니 복제 불필요)
  (function () {
    var c = chain(s.try2);
    c.add(function () {
      var mc = form.addMultipleChoiceItem()
        .setTitle('그럼 어느 앱을 열어보시겠어요? (방금 선택한 앱은 제외해주세요)')
        .setRequired(true);
      mc.setChoices([
        mc.createChoice('NH스마트뱅킹', s.res1_smart),
        mc.createChoice('NH콕뱅크', s.res1_cok),
        mc.createChoice('NHPAY', s.res1_pay),
        mc.createChoice('NH올원뱅크', s.res1_all)
      ]);
      return mc;
    });
  })();

  // 10. 마무리
  (function () {
    var c = chain(s.end);
    c.add(function () {
      return form.addParagraphTextItem().setTitle('혹시 답답하거나 헷갈렸던 부분이 있었나요? (없으면 비워두셔도 돼요)');
    });
    c.add(function () {
      return form.addTextItem().setTitle('만약 구글/네이버에서 검색해본다면 뭐라고 입력할 것 같아요?');
    });
    c.add(function () {
      return form.addMultipleChoiceItem()
        .setTitle("참고로 '경기패스카드'라는 카드는 따로 없고, 실제로는 'K-패스카드'라는 이름이에요. 알고 계셨나요?")
        .setChoiceValues(['예', '아니오'])
        .setRequired(true);
    });
  })();

  Logger.log('편집 링크: ' + form.getEditUrl());
  Logger.log('응답(배포) 링크: ' + form.getPublishedUrl());
}

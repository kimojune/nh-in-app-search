// NH 앱 담당 경로 인식 설문 — Google Forms 자동 생성 스크립트
// 사용법: script.google.com에서 새 프로젝트를 만들고 이 파일을 붙여넣은 뒤
// buildForm 함수를 한 번 실행한다. 최초 실행 시 Forms/Sheets 권한 승인이 필요하다.
// 실행 후 로그에서 편집 링크, 배포 링크, 응답 시트 링크를 확인한다.
// 참고: docs/베이스라인테스트_진행안.md, docs/베이스라인_성공판정기준.md

function buildForm() {
  var form = FormApp.create('NH 앱 담당 경로 인식 설문');
  var responseSheet = SpreadsheetApp.create('NH 앱 담당 경로 인식 설문 응답');

  form.setDescription(
    '안녕하세요! 취업 포트폴리오 프로젝트를 위해 NH농협 앱에서 원하는 기능을 ' +
    '어떻게 찾는지 조사하고 있습니다. NH 앱을 사용해보지 않았어도 참여할 수 있습니다.\n\n' +
    '정답을 맞히는 문제가 아닙니다. 검색하지 말고 평소라면 어떻게 할지 답해주세요. ' +
    '약 2분이 걸리며 이메일 주소는 수집하지 않습니다.'
  );
  form.setConfirmationMessage('응답해주셔서 감사합니다. 프로젝트 검증에 소중히 활용하겠습니다.');
  form.setProgressBar(true);
  form.setCollectEmail(false);
  form.setDestination(FormApp.DestinationType.SPREADSHEET, responseSheet.getId());

  form.addCheckboxItem()
    .setTitle('1. 다음 중 사용해본 NH 앱을 모두 선택해주세요.')
    .setHelpText('한 번이라도 직접 사용해본 앱을 모두 선택해주세요.')
    .setChoiceValues([
      'NH스마트뱅킹',
      'NH콕뱅크',
      'NHPAY',
      'NH올원뱅크',
      '사용해본 앱 없음'
    ])
    .setRequired(true);

  form.addSectionHeaderItem()
    .setTitle('아래 상황을 읽고 답해주세요.')
    .setHelpText(
      "NH농협에서 대중교통 이용 시 교통비 환급 혜택을 받을 수 있는 'K-패스카드'를 " +
      '발급하려고 합니다. 이제 모바일에서 카드를 신청하려고 합니다.'
    );

  form.addMultipleChoiceItem()
    .setTitle('2. 가장 먼저 어떤 행동을 하시겠어요?')
    .setHelpText('검색하지 말고 가장 먼저 할 행동 하나를 골라주세요.')
    .setChoiceValues([
      'NH스마트뱅킹을 연다',
      'NH콕뱅크를 연다',
      'NHPAY를 연다',
      'NH올원뱅크를 연다',
      '어느 앱인지 몰라 인터넷에서 다시 찾아본다',
      '어느 앱인지 몰라 고객센터나 주변 사람에게 물어본다'
    ])
    .setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle('3. 그렇게 선택한 가장 큰 이유는 무엇인가요?')
    .setChoiceValues([
      '해당 앱이 카드 발급을 담당한다고 알고 있어서',
      '이전에 해당 앱에서 카드 관련 기능을 사용해서',
      '평소 가장 자주 사용하는 NH 앱이라서',
      '앱 이름상 카드·결제와 관련 있어 보여서',
      '여러 금융 기능을 모두 제공할 것 같아서',
      '어느 앱인지 몰라서 다시 알아보려고',
      '정확히 몰라 임의로 선택해서',
      '기타'
    ])
    .setRequired(true);

  form.addScaleItem()
    .setTitle('4. 선택한 행동으로 카드 신청 화면을 찾을 수 있다고 얼마나 확신하시나요?')
    .setBounds(1, 5)
    .setLabels('전혀 확신하지 못함', '매우 확신함')
    .setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle('5. 처음 선택한 방법으로 카드 신청 화면을 찾지 못한다면 다음에 어떻게 하시겠어요?')
    .setChoiceValues([
      '다른 NH 앱을 하나씩 확인한다',
      '구글·네이버 등에서 담당 앱과 경로를 검색한다',
      '고객센터나 주변 사람에게 물어본다',
      '카드 신청을 포기한다'
    ])
    .setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle('6. 이전에 K-패스카드를 직접 발급하거나 발급 경로를 찾아본 적이 있나요?')
    .setChoiceValues([
      '직접 발급한 적이 있다',
      '발급 경로를 찾아본 적만 있다',
      '없다'
    ])
    .setRequired(true);

  form.addParagraphTextItem()
    .setTitle('7. NH 앱에서 원하는 기능을 찾을 때 헷갈렸던 경험이 있다면 적어주세요.')
    .setRequired(false);

  Logger.log('편집 링크: ' + form.getEditUrl());
  Logger.log('응답(배포) 링크: ' + form.getPublishedUrl());
  Logger.log('응답 시트 링크: ' + responseSheet.getUrl());
}

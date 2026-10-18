# 운명원 댓글 스튜디오

허용된 유튜브 영상의 고민과 댓글 초안을 검토하고, 전용 Chrome 프로필로 직접 타이핑·게시·결과 확인을 수행하는 **Mac용 로컬 앱**입니다. 기본 화면과 준비된 초안은 API 키 없이 사용할 수 있습니다. 실제 검증 결과와 남은 인수 항목은 [VERIFICATION.md](VERIFICATION.md)를 확인하세요.

## 시연 영상과 제출 체크리스트

**[2분 25초 전체 시연 영상](demo/full-checklist-demo.webm)**의 구간별 시각·재녹화 명령은 [DEMO.md](DEMO.md)에 있습니다. 화면 설명 자막을 넣은 무음 영상이며, 다음 순서를 한 영상에 수록했습니다.

1. **세 칸 사용**: 왼쪽에서 본인 테스트 영상을 선택하고, 가운데에서 고민·85자 초안·근거를 확인한 뒤, 오른쪽에서 유튜브1과 게시 조건을 확인합니다.
2. **한 글자씩 타이핑 → 게시**: 2026-10-15 22:45 KST의 실제 Chrome 녹화를 이어 보여줍니다. 댓글 영역을 확대하고 입력 구간을 0.5배속, 게시 순간을 0.25배속으로 표시하여 글자가 순서대로 들어가는 과정과 YouTube ‘댓글’ 버튼 실행을 확인할 수 있습니다.
3. **내 댓글 확인**: 페이지 새로고침 뒤 동일한 본문과 본인 댓글의 **수정** 메뉴가 보이는 장면을 보여줍니다. 해당 원본의 18.1초 프레임은 정지 장면이라고 명시합니다. 이후 실제 앱의 성공 이력도 보여줍니다.
4. **비밀값·오픈소스 확인**: 녹화 직전의 Git 비밀값 검사 결과와 오픈소스 크레딧을 영상 후반에 표시합니다.

현재 앱 화면은 **2026-10-17 재촬영**, 실제 게시 원본은 **2026-10-15 촬영**입니다. 동일 영상에 다시 게시하거나 모의 성공을 실제 성공으로 사용하지 않았습니다. [실제 테스트 댓글](https://www.youtube.com/watch?v=8A3DUIt1gFI&lc=UgyYK4JoKA_iuR9B2zp4AaABAg)은 기능 검증임을 밝힌 댓글입니다. 공개 저장소에는 편집한 최종 시연 영상만 포함하고 원본 녹화는 제외합니다.

## 설치와 실행

### 인사담당자용: 아무것도 설치되지 않은 Mac에서 시작

**macOS 13.5 이상인 Mac**, 인터넷 연결, 프로그램 설치 권한이 필요합니다. 이 제출본은 Mac용이며 Windows 실행은 지원하지 않습니다. [Node.js 24의 공식 지원 환경](https://github.com/nodejs/node/blob/v24.x/BUILDING.md#platform-list)을 기준으로 합니다. 아래 절차는 **Git·Homebrew·nvm·Xcode·API 키가 없어도** 시작할 수 있습니다. 다른 Mac에서의 실기기 검증은 아직 미완료이며, 동일 Mac의 새 폴더에서는 키·프로필·기존 DB 없이 설치·빌드·기본 실행을 확인했습니다.

**1. 터미널 열기 → Node.js 24와 npm 설치**

`⌘ + Space`를 누르고 `터미널`을 검색해 실행합니다. 아래 명령 블록 전체를 복사해 붙여 넣고 Enter를 누릅니다. Node.js 공식 서버에서 **24 버전 계열의 최신 macOS 설치 프로그램**을 내려받아 체크섬을 확인한 뒤 엽니다. npm도 함께 설치됩니다.

```sh
(
  set -eu
  studio_setup_dir="$(mktemp -d)"
  cd "$studio_setup_dir"
  curl --fail --location --output SHASUMS256.txt \
    'https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt'
  studio_node_pkg="$(awk '$2 ~ /^node-v24\.[0-9]+\.[0-9]+\.pkg$/ {print $2; exit}' SHASUMS256.txt)"
  test -n "$studio_node_pkg"
  curl --fail --location --output "$studio_node_pkg" \
    "https://nodejs.org/dist/latest-v24.x/$studio_node_pkg"
  awk -v filename="$studio_node_pkg" '$2 == filename' SHASUMS256.txt > node-checksum.txt
  shasum -a 256 -c node-checksum.txt
  open "$studio_node_pkg"
)
```

설치 창에서 **계속 → 설치**를 진행하고, 요청되면 Mac 관리자 암호를 입력합니다. **설치가 완료된 뒤** 다음 명령을 실행하세요. `v24.`로 시작하는 버전과 npm 버전이 각각 나오면 됩니다. 설치 권한이 없는 회사 컴퓨터는 사내 IT 담당자의 설치 지원이 필요합니다.

```sh
export PATH="/usr/local/bin:$PATH"
node --version
npm --version
```

**2. Google Chrome 설치**

아래 명령으로 [Chrome 공식 다운로드 페이지](https://www.google.com/chrome/)를 열고 Mac용 설치 파일을 다운로드합니다. 파일을 열어 **Google Chrome을 응용 프로그램(Applications) 폴더로 드래그**합니다. 이미 `/Applications/Google Chrome.app`이 있으면 생략합니다. 기본 화면은 Safari에서도 열 수 있지만 영상 자료 읽기·실제 게시는 Chrome이 필요합니다. [Google 공식 설치 안내](https://support.google.com/chrome/answer/95346?hl=ko).

```sh
open 'https://www.google.com/chrome/'
```

**3. 소스 ZIP 다운로드 → 설치·빌드·실행**

제출자에게 받은 **`unmyeong-comment-studio-날짜.zip` 소스 파일을 다운로드**합니다. 공개 Git 저장소가 제공된 경우에는 저장소의 **Code → Download ZIP**으로 받아도 됩니다. ZIP을 미리 압축 해제할 필요는 없습니다. 아래 명령을 실행하면 파일 선택 창이 열리므로 **다운로드한 소스 ZIP**을 선택하세요.

```sh
(
  set -eu
  export PATH="/usr/local/bin:$PATH"
  node -e 'if (Number(process.versions.node.split(".")[0]) !== 24) { console.error("먼저 Node.js 24 설치를 완료하세요."); process.exit(1); }'
  studio_source_zip="$(osascript -e 'POSIX path of (choose file with prompt "다운로드한 운명원 소스 ZIP을 선택하세요" of type {"public.zip-archive"})')"
  studio_unpack_dir="$(mktemp -d "$HOME/Downloads/unmyeong-review.XXXXXX")"
  ditto -x -k "$studio_source_zip" "$studio_unpack_dir"
  studio_manifest="$(find "$studio_unpack_dir" -maxdepth 3 -type f -name package.json -print -quit)"
  if [ -z "$studio_manifest" ]; then
    printf '%s\n' '소스 ZIP 안에 package.json이 없습니다. 제출용 소스 ZIP인지 확인하세요.'
    exit 1
  fi
  cd "$(dirname "$studio_manifest")"
  node -e 'if (require("./package.json").name !== "unmyeong-comment-studio") { console.error("다른 프로젝트의 ZIP입니다."); process.exit(1); }'
  printf '\n프로젝트 폴더: %s\n이 경로를 메모해 두세요. 다음 실행 때 사용합니다.\n\n' "$PWD"
  npm ci --include=dev
  npm run build
  npm start
)
```

각 단계가 성공해야 다음 단계로 진행합니다. `운명원 댓글 스튜디오 · http://127.0.0.1:4317`이 나오면 **터미널을 켜 둔 채** Safari 또는 Chrome에서 **[http://127.0.0.1:4317](http://127.0.0.1:4317)**을 엽니다. 처음에는 의존성 다운로드와 빌드 때문에 시간이 걸릴 수 있습니다.

**기본 화면 확인에는 `.env`, API 키, YouTube 로그인이 필요 없습니다.** 왼쪽 영상 목록에서 영상을 고르면 준비된 고민·초안·근거가 표시됩니다. 제공 자료는 25개 영상 중 유효 초안 23개와 근거 보완 필요 2개이며, 설치만으로 실제 댓글이 게시되지는 않습니다. 실제 게시까지 확인하려면 아래의 **최초 프로필 준비와 본인 영상 테스트** 절차를 진행하세요.

**4. 종료와 다음 실행**

종료하려면 실행 중인 터미널에서 `Ctrl+C`를 누릅니다. 다음에는 ZIP을 다시 풀지 말고 아래 명령을 실행해 **3번에서 표시된 프로젝트 폴더(`package.json`이 있는 폴더)**를 선택하세요. 같은 폴더를 사용해야 초안·게시 이력·프로필이 유지됩니다.

```sh
(
  set -eu
  export PATH="/usr/local/bin:$PATH"
  studio_project_dir="$(osascript -e 'POSIX path of (choose folder with prompt "package.json이 있는 운명원 프로젝트 폴더를 선택하세요")')"
  cd "$studio_project_dir"
  npm start
)
```

첫 실행 문제 해결:

- `node: command not found` 또는 Node 24가 아닌 버전: 1번 설치를 완료하고 `export PATH="/usr/local/bin:$PATH"`를 다시 실행합니다.
- `package.json` 또는 `package-lock.json`을 찾을 수 없음: 영상 파일이나 일부 파일이 아닌 **전체 소스 ZIP**을 선택했는지 확인합니다.
- 다운로드·`npm ci` 연결 오류: 인터넷 및 회사 네트워크의 `nodejs.org`·`registry.npmjs.org` 접근 허용 여부를 확인합니다. 실패한 단계 이후의 명령을 이어 실행하지 않습니다.
- `포트가 이미 사용 중입니다`: 먼저 기존 앱 터미널에서 `Ctrl+C`로 종료합니다. 다른 프로그램이 쓰는 포트라면 프로젝트 폴더에서 `PORT=4320 npm start`로 실행하고 `http://127.0.0.1:4320`을 엽니다.
- 설치·프로필 상태 확인: 프로젝트 폴더에서 `npm run doctor`를 실행합니다. 처음의 ‘본인 테스트 영상 등록 필요’, ‘프로필 준비 필요’, ‘키 없음(선택)’은 기본 화면 실행을 막는 오류가 아닙니다.

### 이미 개발 환경이 있는 경우

준비물은 **Node.js 24 LTS**, npm, `/Applications/Google Chrome.app`입니다. Node 23은 지원하지 않습니다. 이미 nvm을 사용한다면 `nvm install 24 && nvm use 24`를 실행하세요.

```sh
cd 프로젝트폴더
node --version
npm ci
npm run build
npm start
```

브라우저에서 **http://127.0.0.1:4317**을 엽니다. 서버는 로컬 주소에만 바인딩하며, 화면과 API를 함께 제공합니다. `npm run doctor`로 설치 상태를 확인할 수 있습니다. 서버 종료는 터미널에서 `Ctrl+C`입니다.

개발 화면은 `npm run dev`, 계정 없이 안전하게 화면만 체험하려면 `npm run demo` 후 http://127.0.0.1:4318 을 사용하세요. 체험 모드의 영상·댓글·조회수·게시 결과는 모두 **명시된 모의 데이터**이며 실제 유튜브에는 게시하지 않습니다.

## 최초 프로필 준비와 본인 영상 테스트

1. 본인이 소유하거나 테스트를 허가받은 영상을 준비합니다. 개발 중에는 운영 채널에 게시하지 않습니다.
2. 서버를 종료하고 `npm run test-video:add -- 'https://youtu.be/영상ID' --owned`로 등록합니다.
3. 선택적으로 `npm run test:draft -- 'https://youtu.be/영상ID'`로 기능 점검용 댓글을 만듭니다. 이 댓글은 테스트임을 명시하며 운영 채널용 마케팅 초안으로 쓰지 않습니다. 추가 인자로 원하는 40~120자 테스트 댓글을 전달할 수 있습니다.
4. `npm start` 후 설정 → 유튜브1 → **로그인 창 열기**를 누릅니다. 열린 전용 창의 **YouTube**에 직접 로그인합니다. Google 로그인·추가 인증은 사용자가 수행합니다.
5. 대시보드의 **로그인 완료·창 종료**를 누릅니다. Mac에서는 창 닫기만으로 Chrome 프로세스가 끝나지 않아 프로필 잠금이 남을 수 있습니다. 이 버튼은 앱이 연 해당 전용 프로필 프로세스만 종료합니다. 또는 Chrome 메뉴의 종료를 사용하세요.
6. 기본 탭에서 테스트 영상 → 근거·댓글 검토 → 검토 확인란 → **검토 내용 저장** → **댓글 게시하기** 순서로 진행합니다.
7. Chrome이 한 글자씩 입력합니다. 게시 후 새로고침해 동일한 본문과 본인 댓글의 수정 메뉴를 확인해야 완료로 기록합니다.

전용 폴더는 `.local/profiles/youtube1`, `youtube2`, `youtube3`입니다. 일상용 Chrome 프로필을 복사하거나 쿠키·인증 정보를 추출하지 않습니다. 인증은 Chrome이 관리하며, 자동 실행에서도 macOS의 실제 인증 저장 방식을 유지합니다. 로그인 여부는 폴더 존재만으로 판단하지 않고 실제 유튜브 화면에서 확인합니다. [Chrome 전용 데이터 디렉터리 안내](https://developer.chrome.com/blog/remote-debugging-port).

## 기본 작업 흐름

- 영상 불러오기: 외롭여, 리즈시절 LizTV, 러브커넥트 유지연, 연애데이터 노노, 심리조각의 RSS 최신 5개씩을 조회합니다. 부분 실패는 저장된 목록과 구분해 알립니다.
- 영상 링크 입력: 유튜브 URL을 ID로 정규화하고 실제 채널을 확인합니다. 허용 채널과 등록한 테스트 영상만 추가할 수 있습니다.
- 초안: 고민 한 줄, 본문, 근거 발췌, 문자 수, 자동 검증 결과를 표시합니다. 사용자가 편집하면 검토 표시가 해제됩니다.
- 자동 검사: 표시 문자 기준 40~120자, 운명원 언급, 링크·해시태그 금지, 동일 댓글 중복, 발췌 근거 일치 여부입니다. 구체성·사실성·허위 이용 후기는 사람이 별도로 검토해야 합니다.
- 프로필: 직접 선택 또는 성공 후 유튜브1→2→3 순환입니다. 실행 중 영상·초안·프로필을 변경할 수 없습니다.
- 실행 이력: 성공·실패·확인 필요와 캡처를 확인합니다. 화면을 다시 열면 DB의 실행 상태를 복원합니다.

기본은 **테스트 모드**입니다. 설정에서 심사 모드로 명시적으로 변경해야 운영 채널 게시가 허용됩니다. 어떤 모드에서도 직접 게시 버튼을 눌러야 실행합니다. 모든 프로필 합산 **한국 시간 하루 최대 10개**, 이 설치의 영속 이력 전체에서 **영상당 1개**입니다. 성공·진행 중·결과 미확정·기존 본인 댓글 발견 영상은 추가 게시를 막습니다. 화면에 보이지 않는 과거 수동 댓글까지 전부 탐지한다고 보장하지 않습니다.

## 선택 API 연결

`.env.example`을 `.env`로 복사한 뒤 로컬 편집기로 값을 입력하고 서버를 다시 시작하세요. 키를 채팅·Git·화면에 붙여 넣지 마세요.

```dotenv
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.4-mini-2026-03-17
YOUTUBE_API_KEY=
PORT=4317
```

OpenAI는 [Responses API의 구조화된 출력](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses)을 사용합니다. 확보한 영상 자료만 전송하며 `store:false`로 요청합니다. 공개 자막 우선, 없으면 제목·설명을 사용하고 인기 댓글은 보조 자료로만 취급합니다. 근거 부족·거절·미완료·시간 초과는 게시 가능한 초안으로 저장하지 않습니다. 형식 오류만 한 번 수정 생성합니다. [기본 모델](https://developers.openai.com/api/docs/models/gpt-5.4-mini)은 환경변수로 변경할 수 있습니다.

YouTube Data API v3를 활성화한 키는 상승 탐색에 사용합니다. API 키는 서버 환경변수에서만 읽으며 화면에는 설정 여부만 표시합니다. 서버의 오류 메시지는 키·원본 응답·요청 헤더를 출력하지 않습니다.

상승 관측은 사용자가 시작한 뒤 서버가 실행되는 동안만 작동합니다. 최근 7일 ‘연애’ 최신 50개 검색을 시작 시·매시간 갱신하고 최대 200개를 관측합니다. 15분마다 실제 조회수를 저장합니다. 최신 관측과 55~65분 전 관측을 실제 경과 시간으로 환산해 시간당 150회 이상, 현재 조회수 1,000~5,000인 경우만 후보로 표시합니다. 최초 판정은 약 1시간 뒤입니다. 중단 기간을 추정해 채우지 않습니다. 20분 이상 오래된 자료·관측 부족·조회수 감소를 별도 표시합니다.

`npm run observation:report`는 저장된 실제 관측만 읽어 `.local/artifacts/observation-report.json`으로 내보냅니다. API를 호출하거나 과거 값을 만들어 넣지 않으며, 아직 유효한 비교가 없으면 비정상 종료합니다.

외부 후보의 자료는 YouTube API로만 읽습니다. 후보 페이지를 자동으로 열거나 게시하지 않습니다. 탐색 초안과 근거는 게시용과 분리됩니다. 허용 채널의 후보라도 기본 흐름에서 별도 검증해야 합니다. 외부 후보 자막 다운로드는 전제하지 않습니다. [공식 자막 다운로드 권한](https://developers.google.com/youtube/v3/docs/captions/download).

## 실패 복구

- **게시 전 실패**: 계정·프로필 잠금·댓글 활성화·네트워크를 점검하고 재시도할 수 있습니다. 실패한 슬롯은 반환됩니다.
- **게시 시작 이후 중단 / 확인 필요**: 이미 댓글이 올라갔을 수 있습니다. **결과만 다시 확인**을 사용하세요. 자동 재게시하지 않으며 날짜가 바뀌어도 확인 전까지 예약을 유지합니다.
- **기존 댓글로 차단**: 현재 화면에서 본인 댓글을 발견한 경우입니다. 추가 게시를 영구 차단하고 새 게시 슬롯은 소비하지 않습니다.
- **프로필 사용 중**: 수동 로그인 창을 대시보드에서 종료하세요. 다른 크롬 프로필의 창은 종료하지 않습니다.
- **자막 미확보**: 공개 화면 수집은 유튜브 UI·접근 상태에 영향을 받습니다. 제목·설명에 근거가 부족하면 초안을 준비 완료로 취급하지 마세요.
- **동일 폴더 서버 중복 실행**: 기존 서버를 종료하세요. DB와 프로필을 여러 서버가 동시에 사용하지 않도록 실행 잠금이 있습니다.

중복 제한을 피하려고 DB나 실패 이력을 지우지 마세요. 백업할 때는 서버를 종료한 후 `.local`을 로컬의 안전한 위치에 보관하세요. 로그인 프로필은 제출본·공개 저장소로 전달하지 않습니다.

## 검증과 제출

```sh
npm run check
npm run test:e2e
npm run secrets:check
npm run drafts:check
npm run release:check
```

`drafts:check`는 실행 시점의 RSS 최신 목록과 사전 초안의 누락·형식·근거를 대조합니다. 사람의 사실성 검토를 대신하지 않습니다. `drafts:refresh`는 OpenAI 키로 최신 초안을 다시 생성하며 전체 생성이 끝난 경우에만 JSON을 교체합니다. 기존 DB의 편집 초안은 보존합니다. 새 배포에서 JSON을 검증하려면 별도 `.local-acceptance` 폴더를 사용하세요. 이 폴더도 실제 게시 이력과 독립적이므로 동일 영상에 재게시하지 마세요.

개인 데이터는 `.local*/`, 비밀값은 `.env`, 빌드·설치 파일은 `dist/`, `node_modules/`로 분리되어 Git에서 제외됩니다. `drafts/prepared.json`은 공개 영상 자료와 초안만 포함합니다. 원문 과제 PDF는 참고용으로만 로컬에 두고 제출 패키지에 포함하지 않습니다.

프로젝트 구조: `src/shared` 공통 타입·정책, `src/server` 수집·AI·SQLite·게시·탐색·API, `src/client` 한글 대시보드, `drafts` 사전 초안, `tests` 단위·통합·화면 테스트, `scripts` 설치·출고·초안 관리 도구입니다. [제작 기록](PROCESS.md), [실제 검증 상태](VERIFICATION.md), [시연 대본](DEMO.md)을 함께 제공합니다.

선택 녹화는 `npm run record:install`로 FFmpeg를 프로젝트 내부에 설치한 뒤 `RECORD_POSTING=1 npm start`로 실행합니다. 게시·결과 확인 브라우저만 `.local/recordings`에 녹화하며, 기본 실행에서는 녹화하지 않습니다. 이번 검증 상태를 재녹화하는 `record:tour` 명령은 [시연 기록](DEMO.md)을 참고하세요. 시연용 영상에 개인 계정 화면이 포함되는지 검토하고 공유하세요. `npm run package:submission`은 Git 추적 소스만 ZIP으로 묶으며 인수 완료 여부는 별도로 확인합니다.

소스 ZIP 안에서는 한글 요구사항 정의서의 파일명을 `REQUIREMENTS.md`로 보관합니다. 다른 압축 프로그램에서도 이름이 깨지지 않게 하기 위한 이름 변경이며 문서 내용은 같습니다. 원본 프로젝트의 한글 파일명은 유지합니다.

## Git 비밀값 점검

**2026-10-19 공개 전 로컬 검사 결과: API 키 일치·의심 패턴과 제외 대상 추적 파일 0건.** Git 작업 트리의 추적 파일, 실제 스테이징된 내용, 모든 로컬 참조의 커밋 이력을 검사했습니다. OpenAI·YouTube API 키 패턴뿐 아니라 로컬 `.env`에 설정된 두 키의 실제 값도 대조했으며 값 자체는 출력하지 않습니다.

`npm run secrets:check`는 로컬 추적 파일과 Git 이력만 검사합니다. 원격 서버의 비밀값 검사를 했다고 주장하지 않습니다. 일치가 발견되면 파일명과 검사 위치만 표시하고 실패로 종료합니다. 이 검사는 모든 종류의 비밀값을 탐지한다는 보장은 아닙니다.

- `.env`, `.env.*`는 제외하고, 값이 비어 있는 `.env.example`만 포함합니다.
- `.local*/` 안의 Chrome 인증 프로필·SQLite DB·실패 캡처·원본 녹화는 제외합니다.
- `node_modules/`, `dist/`, `.runtime/`, 원문 과제 PDF도 제출 Git에 넣지 않습니다.
- 이력에서 키가 발견되면 현재 파일에서 지우는 것만으로 해결되지 않습니다. 해당 키를 폐기·재발급하고 이력을 정리한 뒤 재검사합니다.

## 오픈소스 출처

버전은 설치된 패키지와 `package-lock.json` 기준입니다. **직접 의존성 20개의 버전·출처·라이선스와 원문 고지**는 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)에, 간접·플랫폼별 선택 의존성을 포함한 잠금 파일 목록은 [dependency-licenses.json](docs/dependency-licenses.json)에 있습니다.

- 화면: [React / React DOM](https://github.com/react/react) 19.3.1 — MIT. [Lucide React](https://github.com/lucide-icons/lucide) 0.468.0 — ISC, 일부 Feather 아이콘 MIT.
- 서버: [Express](https://github.com/expressjs/express) 5.3.0 — MIT. [dotenv](https://github.com/motdotla/dotenv) 17.4.2 — BSD-2-Clause.
- 수집·검증: [fast-xml-parser](https://github.com/NaturalIntelligence/fast-xml-parser) 5.11.2, [Zod](https://github.com/colinhacks/zod) 4.6.7 — MIT.
- 브라우저·화면 테스트: [Playwright / @playwright/test](https://github.com/microsoft/playwright) 1.64.1 — Apache-2.0.
- AI 연결: [OpenAI Node SDK](https://github.com/openai/openai-node) 6.49.0 — Apache-2.0.
- 빌드·검증: [TypeScript](https://github.com/microsoft/TypeScript) 5.9.3 — Apache-2.0. [Vite](https://github.com/vitejs/vite) 7.3.7, [React 플러그인](https://github.com/vitejs/vite-plugin-react) 5.2.0, [Vitest](https://github.com/vitest-dev/vitest) 5.0.4 — MIT.
- 개발 도구: [tsx](https://github.com/privatenumber/tsx) 4.23.15, [Prettier](https://github.com/prettier/prettier) 3.9.10, [DefinitelyTyped 타입 정의](https://github.com/DefinitelyTyped/DefinitelyTyped) — MIT.
- 실행 기반: [Node.js](https://github.com/nodejs/node) 24.19.0 — MIT 및 포함된 제3자 고지. 내장 드라이버의 [SQLite](https://sqlite.org/copyright.html) — public domain.
- 시연 제작: [FFmpeg](https://ffmpeg.org/) n7.0.1-playwright-build-1013 — 설치본의 LGPL-2.1 고지 확인. WebM 인코딩·디코딩에 [libvpx](https://chromium.googlesource.com/webm/libvpx/)를 사용합니다. 녹화 도구의 바이너리는 소스 ZIP에 포함하지 않습니다.

Google Chrome은 별도 설치 브라우저이며 오픈소스 의존성과 구분합니다. YouTube와 OpenAI API는 외부 서비스입니다. 자체 제작한 코드·화면과 위 라이브러리·아이콘의 출처를 구분하며, 외부 저작권 고지를 보존합니다.

import { localPath, ensureDataDir } from "../src/server/config.js";
import { chromium, type Locator } from "playwright";
import { createServer } from "node:http";
import {
  readFileSync,
  mkdirSync,
  copyFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";

// Read-only real-app tour plus dated, successful original footage. No new post.
ensureDataDir();
const clip = process.argv[2];
if (!clip || !/^[\w@.-]+\.webm$/.test(clip))
  throw Error("실제 성공 게시 녹화의 파일명을 전달하세요.");
const confirmationTime = Number(process.argv[3] ?? "18.1");
if (!Number.isFinite(confirmationTime) || confirmationTime < 0)
  throw Error("확인 프레임 시각이 필요합니다.");
const preview = process.argv.includes("--preview");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const folder = localPath(`artifacts/checklist-${stamp}`);
mkdirSync(folder, { recursive: true });
const input = localPath(`recordings/${clip}`);
const ffmpegFolder = readdirSync(localPath("playwright")).find((n) =>
  /^ffmpeg-\d+$/.test(n),
);
if (!ffmpegFolder) throw Error("먼저 npm run record:install을 실행하세요.");
execFileSync(localPath(`playwright/${ffmpegFolder}/ffmpeg-mac`), [
  "-hide_banner",
  "-loglevel",
  "error",
  "-ss",
  String(confirmationTime),
  "-i",
  input,
  "-frames:v",
  "1",
  `${folder}/confirmation.png`,
]);
// The security card is based on a fresh passing check, never a hard-coded success.
const audit = execFileSync(
  process.execPath,
  ["--import", "tsx", "scripts/secrets-check.ts"],
  { encoding: "utf8" },
);
writeFileSync(`${folder}/secrets-check.txt`, audit);
// Trim initial page loading before replay; browser seeking on a non-range stream
// can silently fall back to zero and insert long blank frames into the demo.
const replayOffset = 5.15;
const replay = `${folder}/posting-replay.webm`;
execFileSync(localPath(`playwright/${ffmpegFolder}/ffmpeg-mac`), [
  "-hide_banner",
  "-loglevel",
  "error",
  "-ss",
  String(replayOffset),
  "-i",
  input,
  "-an",
  "-c:v",
  "libvpx-vp9",
  "-b:v",
  "1500k",
  "-deadline",
  "realtime",
  "-cpu-used",
  "8",
  replay,
]);
const bytes = readFileSync(replay);
const confirmation = readFileSync(`${folder}/confirmation.png`);
const server = createServer((req, res) => {
  if (req.url === "/clip.webm" || req.url === "/confirmation.png") {
    const video = req.url === "/clip.webm";
    const data = video ? bytes : confirmation;
    res.writeHead(200, {
      "Content-Type": video ? "video/webm" : "image/png",
      "Content-Length": data.length,
    });
    res.end(data);
    return;
  }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(`<!doctype html><html lang="ko"><meta charset="utf-8"><title>운명원 댓글 스튜디오 전체 시연</title>
  <style>*{box-sizing:border-box}body{margin:0;background:#171529;color:#fff;font-family:-apple-system,BlinkMacSystemFont,sans-serif}iframe{display:block;border:0;width:1280px;height:900px;background:#faf8ff}footer{position:fixed;bottom:0;left:0;right:0;height:100px;background:#171529;padding:18px 32px;display:flex;gap:24px;align-items:center;border-top:3px solid #bea8f1}#step{color:#d9c4ff;font-weight:800;font-size:38px;min-width:55px}#title{font-size:23px;font-weight:700;line-height:1.3}#detail{font-size:15px;color:#d0c6e1;margin-top:8px}#stage{height:900px;padding:55px 65px;display:none}h1{font-size:32px;margin:0 0 18px;line-height:1.4}p{font-size:20px;color:#d1c8e0;line-height:1.8}.tag{font-size:15px;color:#c5b0e8;margin-bottom:18px}.crop{position:relative;width:980px;height:500px;overflow:hidden;background:white;transform:scale(1.15);transform-origin:top left;margin-top:25px}video,.crop img{position:absolute;left:0;top:-205px;width:1280px;height:900px;max-width:none}pre{white-space:pre-wrap;font:19px/1.9 ui-monospace,monospace;background:#252039;padding:25px;border:1px solid #54466b;border-radius:12px}.source{background:#252039;border-left:4px solid #b39cdb;padding:14px 22px;margin:13px 0;font-size:19px;line-height:1.7}.muted{color:#c3b9d2;font-size:16px}.proof{color:#b6e8d2}</style>
  <section id="stage"></section>
  <footer id="narration"><div id="step">01</div><div><div id="title">세 칸으로 진행하는 댓글 작업</div><div id="detail">실제 로컬 앱 · 영상 선택 → 맥락·댓글 검토 → 프로필·게시 확인</div></div></footer></html>`);
});
await new Promise<void>((r) => server.listen(4340, "127.0.0.1", r));
const browser = await chromium.launch({ channel: "chrome", headless: true });
const timeline: { seconds: number; chapter: string }[] = [];
try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1000 },
    ...(preview
      ? {}
      : {
          recordVideo: {
            dir: `${folder}/raw`,
            size: { width: 1280, height: 1000 },
          },
        }),
  });
  // The tour cannot mutate app data or initiate a post/API generation.
  await context.route("**/api/**", (route) =>
    ["GET", "HEAD"].includes(route.request().method())
      ? route.continue()
      : route.abort(),
  );
  const page = await context.newPage();
  const recording = page.video();
  const started = Date.now();
  const hold = (ms: number) =>
    new Promise((r) => setTimeout(r, preview ? 100 : ms));
  const caption = async (step: string, title: string, detail: string) => {
    timeline.push({ seconds: (Date.now() - started) / 1000, chapter: title });
    await page.evaluate(
      ({ step, title, detail }) => {
        if (!document.getElementById("narration")) {
          const footer = document.createElement("footer");
          footer.id = "narration";
          footer.innerHTML =
            '<div id="step"></div><div><div id="title"></div><div id="detail"></div></div>';
          document.body.appendChild(footer);
          const style = document.createElement("style");
          style.textContent =
            "#narration{position:fixed;bottom:0;left:0;right:0;z-index:999;height:100px;box-sizing:border-box;background:#171529;color:white;padding:18px 32px;display:flex;gap:24px;align-items:center;border-top:3px solid #bea8f1;font-family:-apple-system,BlinkMacSystemFont,sans-serif}#step{color:#d9c4ff;font-weight:800;font-size:38px;min-width:55px}#title{font-size:23px;font-weight:700;line-height:1.3}#detail{font-size:15px;color:#d0c6e1;margin-top:8px}body{padding-bottom:100px}";
          document.head.appendChild(style);
        }
        document.getElementById("step")!.textContent = step;
        document.getElementById("title")!.textContent = title;
        document.getElementById("detail")!.textContent = detail;
      },
      { step, title, detail },
    );
    console.log(title);
  };
  const card = async (html: string) =>
    page.evaluate((html) => {
      const stage = document.getElementById("stage")!;
      stage.style.display = "block";
      stage.innerHTML = html;
    }, html);
  const showApp = async () => {
    await page.goto("http://127.0.0.1:4317");
  };
  await showApp();
  const app = page.mainFrame();
  await app.getByRole("button", { name: /내 테스트 영상.*13504572/ }).waitFor();
  const highlight = async (locator: Locator) => {
    await app
      .locator(".panel")
      .evaluateAll((els) =>
        els.forEach((el) => ((el as HTMLElement).style.outline = "")),
      );
    await locator.evaluate((el) => {
      (el as HTMLElement).style.outline = "3px solid #9b76d1";
    });
  };
  await caption(
    "01",
    "왼쪽 칸 · 본인 테스트 영상 선택",
    "2026-10-17 실제 앱 재촬영 · 이 영상의 실제 게시 원본은 뒤에서 이어집니다.",
  );
  await highlight(app.locator(".video-panel"));
  await app.getByRole("combobox", { name: "채널 필터" }).selectOption("test");
  await hold(2500);
  await app.getByRole("button", { name: /내 테스트 영상.*13504572/ }).click();
  await app.getByLabel("댓글 초안", { exact: true }).waitFor();
  await app.locator(".studio-grid").scrollIntoViewIfNeeded();
  await hold(6500);
  await caption(
    "02",
    "가운데 칸 · 고민·댓글·85자 검사 확인",
    "기능 점검임을 밝힌 실제 게시 문구입니다. 자동 검사 뒤 사람이 근거를 검토합니다.",
  );
  await highlight(app.locator(".draft-panel"));
  await app.getByLabel("댓글 초안", { exact: true }).click();
  await hold(6000);
  await app.getByText("댓글의 근거 확인", { exact: true }).click();
  await app.locator(".evidence-details").scrollIntoViewIfNeeded();
  await hold(6500);
  await caption(
    "03",
    "오른쪽 칸 · 유튜브1과 게시 조건 확인",
    "이미 성공한 영상은 재게시가 차단됩니다. 다음 장면은 10월 15일의 실제 첫 게시입니다.",
  );
  await highlight(app.locator(".posting-panel"));
  await app.getByRole("combobox", { name: "게시할 프로필" }).focus();
  await app.locator(".progress").scrollIntoViewIfNeeded();
  await hold(9500);
  await page.screenshot({ path: `${folder}/three-columns.png` });
  if (preview) {
    console.log(`미리보기: ${folder}/three-columns.png`);
    await context.close();
  } else {
    await page.goto("http://127.0.0.1:4340");
    await caption(
      "04",
      "Chrome · 한 글자씩 실제 입력",
      "2026-10-15 22:45 KST 원본 · 입력 0.5배속 · 댓글 영역 확대",
    );
    await card(
      '<div class="tag">실제 첫 게시 녹화 · 영상 8A3DUIt1gFI · 유튜브1</div><h1>한 글자씩 입력 → 댓글 게시 → 새로고침</h1><p>원본의 댓글 영역을 확대했습니다. 시연을 위한 재게시를 하지 않았습니다.</p><div class="crop"><video id="clip" src="/clip.webm" muted playsinline></video></div>',
    );
    await page.locator("video").evaluate(async (el) => {
      const v = el as HTMLVideoElement;
      await new Promise<void>((r) => {
        if (v.readyState >= 1) r();
        else v.addEventListener("loadedmetadata", () => r(), { once: true });
      });
      v.playbackRate = 0.5;
      await v.play();
    });
    await page.waitForFunction(
      () =>
        (document.querySelector("video") as HTMLVideoElement).currentTime >=
        4.55,
    );
    await page
      .locator("video")
      .evaluate((el) => (el as HTMLVideoElement).pause());
    await caption(
      "05",
      "게시 직전 · 완성된 댓글과 게시 버튼 확인",
      "실제 원본 약 9.7초 일시정지 · 다음에 ‘댓글’ 버튼 실행을 이어 보여줍니다.",
    );
    const pausedAt = await page
      .locator("video")
      .evaluate((el) => (el as HTMLVideoElement).currentTime);
    if (pausedAt > 4.8) throw Error("게시 직전 정지 시각을 지나쳤습니다.");
    await page.screenshot({ path: `${folder}/before-submit.png` });
    console.log(
      `원본 ${(pausedAt + replayOffset).toFixed(2)}초에서 게시 직전 정지`,
    );
    await hold(3000);
    await caption(
      "05",
      "YouTube ‘댓글’ 버튼으로 실제 게시",
      "실제 첫 게시 원본 · 게시 순간 0.25배속 · 버튼 실행 후 댓글 입력란이 닫힙니다.",
    );
    await page.locator("video").evaluate((el) => {
      const video = el as HTMLVideoElement;
      video.playbackRate = 0.25;
      return video.play();
    });
    await page.waitForFunction(
      () =>
        (document.querySelector("video") as HTMLVideoElement).currentTime >=
        4.95,
    );
    await page.locator("video").evaluate((el) => {
      (el as HTMLVideoElement).playbackRate = 1;
    });
    await caption(
      "06",
      "게시 후 페이지를 새로고침하고 결과 확인",
      "실제 첫 게시 원본 · 이 구간은 1배속 · 서버에 남은 내 댓글인지 다시 확인합니다.",
    );
    await page.waitForFunction(
      () => (document.querySelector("video") as HTMLVideoElement).ended,
      {},
      { timeout: 30_000 },
    );
    await caption(
      "06",
      "내 댓글 확인 · 같은 본문 + 본인 ‘수정’ 메뉴",
      `실제 녹화의 ${confirmationTime}초 정지 장면 · 클릭만으로 성공 처리하지 않습니다.`,
    );
    await card(
      `<div class="tag">2026-10-15 실제 녹화 정지 장면 · 원본 ${confirmationTime}초</div><h1>게시된 댓글 본문과 본인 ‘수정’ 메뉴</h1><p>새로고침 이후에도 동일한 댓글이 있고, 내 댓글의 관리 메뉴가 보입니다.</p><div class="crop"><img src="/confirmation.png" alt="실제 내 댓글과 수정 메뉴"></div>`,
    );
    await hold(12000);
    await page.screenshot({ path: `${folder}/own-comment.png` });
    await showApp();
    await app.getByRole("button", { name: "실행 이력", exact: true }).click();
    await caption(
      "07",
      "앱 실행 이력 · 실제 게시 완료와 원문 보존",
      "2026-10-17 실제 앱 · 10월 15일 성공 이력을 그대로 유지합니다.",
    );
    await hold(9000);
    await app
      .getByRole("button", { name: "댓글 스튜디오", exact: true })
      .click();
    await app.getByRole("combobox", { name: "채널 필터" }).selectOption("all");
    await app
      .getByRole("button", {
        name: /외롭여 남자는 ‘원래 그런 사람’이 아닙니다/,
      })
      .click();
    await caption(
      "+",
      "선택 기능 · 실제 OpenAI로 생성한 초안과 근거",
      "10월 15일 생성 결과 · 현재 화면에서 API를 다시 호출하거나 운영 채널에 게시하지 않습니다.",
    );
    await app.locator(".evidence-details").evaluate((el) => {
      (el as HTMLDetailsElement).open = true;
    });
    await app
      .locator(".evidence-details blockquote")
      .first()
      .scrollIntoViewIfNeeded();
    await hold(11000);
    await app
      .getByRole("button", { name: "상승 영상 탐색", exact: true })
      .click();
    await caption(
      "+",
      "상승 영상 탐색 · 실제 관측과 유효 시간 구분",
      "현재는 관측 중지 상태입니다. 10월 15일 55.54분 실측 결과는 기록 문서에 보관했습니다.",
    );
    await hold(7500);
    await app.getByRole("button", { name: "설정", exact: true }).click();
    await caption(
      "08",
      "설정 · 전용 프로필 3개와 API 키 설정 여부",
      "화면에는 키의 설정 여부만 표시하며, 실제 키 값은 로컬 .env에만 둡니다.",
    );
    await hold(8500);
    await page.goto("http://127.0.0.1:4340");
    await caption(
      "09",
      "제출 점검 · Git 비밀값 검사 통과",
      "작업 트리·스테이징·로컬 이력 검사 · 커밋과 원격 저장소는 아직 없습니다.",
    );
    await card(
      '<div class="tag">2026-10-17 · 이번 녹화 직전 실제 검사 결과</div><h1>API 키와 개인 데이터는 제출 파일에서 제외</h1><pre id="audit"></pre><p>.env · .local*/ · Chrome 프로필 · DB · 캡처 원본은 Git에서 제외합니다.</p><p class="muted">검사 명령: npm run secrets:check<br>공개 저장소 업로드는 아직 수행하지 않았습니다. 업로드 직전에 다시 검사합니다.</p>',
    );
    await page.locator("#audit").evaluate((el, value) => {
      el.textContent = value;
    }, audit.trim());
    await hold(15000);
    await caption(
      "10",
      "오픈소스 출처 · README와 원문 고지 제공",
      "설치 버전 기준 출처·라이선스 · THIRD_PARTY_NOTICES.md · 전체 의존성 목록 제공",
    );
    await card(
      '<div class="tag">오픈소스 크레딧 · package-lock.json으로 버전 고정</div><h1>사용한 라이브러리와 도구의 출처</h1><div class="source">React / React DOM · react.dev · MIT<br>Vite / Vitest · vite.dev / vitest.dev · MIT</div><div class="source">Express · expressjs.com · MIT<br>Playwright · playwright.dev · Apache-2.0<br>OpenAI Node SDK · github.com/openai/openai-node · Apache-2.0</div><div class="source">Lucide 아이콘 · lucide.dev · ISC (일부 Feather MIT)<br>TypeScript · typescriptlang.org · Apache-2.0<br>FFmpeg 녹화 도구 · ffmpeg.org · LGPL-2.1</div><p class="muted">그 외 dotenv, fast-xml-parser, Zod, tsx, Prettier, 타입 패키지와 런타임은<br>README 및 THIRD_PARTY_NOTICES.md에 버전·출처·라이선스를 함께 적었습니다.</p>',
    );
    await hold(15000);
    await caption(
      "✓",
      "세 칸 사용 → 실제 타이핑 → 게시 → 내 댓글 확인",
      "실제 게시 원본과 현재 앱을 구분해 수록 · 비밀값 검사와 오픈소스 출처까지 확인",
    );
    await card(
      '<div class="tag">운명원 댓글 스튜디오 · 시연 종료</div><h1>설치부터 실행까지 README에서 재현</h1><pre>npm ci\nnpm run build\nnpm start</pre><p class="proof">실제 테스트 게시 1건 · 같은 본문과 본인 수정 메뉴 확인</p><p class="muted">전체 프로젝트의 남은 인수 항목은 VERIFICATION.md에 별도 기록했습니다.<br>다른 Mac 검증, 근거 보완 초안 2개, 공개 원격 저장소 제출은 미완료입니다.</p>',
    );
    await hold(6500);
    await context.close();
    const result = `${folder}/full-checklist-demo.webm`;
    copyFileSync(await recording!.path(), result);
    writeFileSync(
      `${folder}/timeline.json`,
      JSON.stringify(timeline, null, 2) + "\n",
    );
    console.log(`전체 시연 저장: ${result}`);
  }
} finally {
  await browser.close();
  server.close();
}

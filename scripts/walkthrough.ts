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
const prepared = JSON.parse(readFileSync("drafts/prepared.json", "utf8")) as {
  drafts: { videoId: string; text: string; validationErrors: string[]; evidence: { source: string; quote: string }[] }[];
};
const sample = (videoId: string) => {
  const draft = prepared.drafts.find((item) => item.videoId === videoId);
  if (!draft?.text || !draft.evidence[0])
    throw Error(`시연할 영상 ${videoId}의 실제 초안과 근거가 없습니다.`);
  return draft;
};
const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
  );
const spokenSample = sample("UUWKeaB_e0w");
const chapterSample = sample("j5-Lz5E0nWQ");
if (spokenSample.evidence[0].source !== "transcript" || chapterSample.evidence[0].source !== "description")
  throw Error("자막·설명 근거의 출처가 예상과 다릅니다.");
const validDrafts = prepared.drafts.filter((draft) => draft.text.trim() && !draft.validationErrors.length);
if (validDrafts.length !== 23 || new Set(validDrafts.map((draft) => draft.text)).size !== 23)
  throw Error("사전 초안 23개 고유 문구 검증이 달라졌습니다.");
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
const policyCheck = execFileSync(
  process.execPath,
  ["node_modules/vitest/vitest.mjs", "run", "tests/store.test.ts", "tests/service.test.ts", "--reporter=verbose"],
  { encoding: "utf8", env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" } },
);
for (const expected of [
  "별도 SQLite 연결과 재실행에도 제출 예약과 영상 잠금이 유지된다",
  "다른 계정으로 바꿔도 성공 영상 재게시를 차단한다",
  "10개 성공 후 11번째 게시를 막는다",
  "테스트 모드는 운영 채널 게시를 차단한다",
  "Tests  16 passed (16)",
]) if (!policyCheck.includes(expected)) throw Error(`게시 정책 테스트 결과가 예상과 다릅니다: ${expected}`);
writeFileSync(`${folder}/policy-check.txt`, policyCheck);
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
  <style>*{box-sizing:border-box}body{margin:0;background:#171529;color:#fff;font-family:-apple-system,BlinkMacSystemFont,sans-serif}iframe{display:block;border:0;width:1280px;height:900px;background:#faf8ff}footer{position:fixed;bottom:0;left:0;right:0;height:100px;background:#171529;padding:18px 32px;display:flex;gap:24px;align-items:center;border-top:3px solid #bea8f1}#step{color:#d9c4ff;font-weight:800;font-size:38px;min-width:55px}#title{font-size:23px;font-weight:700;line-height:1.3}#detail{font-size:15px;color:#d0c6e1;margin-top:8px}#stage{height:900px;padding:55px 65px;display:none}h1{font-size:32px;margin:0 0 18px;line-height:1.4}p{font-size:20px;color:#d1c8e0;line-height:1.8}.tag{font-size:15px;color:#c5b0e8;margin-bottom:18px}.crop{position:relative;width:980px;height:500px;overflow:hidden;background:white;transform:scale(1.15);transform-origin:top left;margin-top:25px}video,.crop img{position:absolute;left:0;top:-205px;width:1280px;height:900px;max-width:none}pre{white-space:pre-wrap;font:19px/1.9 ui-monospace,monospace;background:#252039;padding:25px;border:1px solid #54466b;border-radius:12px}.source{background:#252039;border-left:4px solid #b39cdb;padding:14px 22px;margin:13px 0;font-size:19px;line-height:1.7}.muted{color:#c3b9d2;font-size:16px}.proof{color:#b6e8d2}.comparison{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin:22px 0}.comparison .source{min-height:350px;margin:0;font-size:18px}.comparison strong{color:#dfccff;display:block;margin-bottom:12px}.comparison small{color:#b5e6d5;display:block;margin:8px 0}.comparison p{font-size:18px;line-height:1.65;margin:0 0 12px}.source mark{background:#7961ab;color:white;padding:1px 4px}</style>
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
  await hold(2000);
  await app.getByRole("button", { name: /내 테스트 영상.*13504572/ }).click();
  await app.getByLabel("댓글 초안", { exact: true }).waitFor();
  await app.locator(".studio-grid").scrollIntoViewIfNeeded();
  await hold(4000);
  await caption(
    "02",
    "가운데 칸 · 고민·댓글·85자 검사 확인",
    "기능 점검임을 밝힌 실제 게시 문구입니다. 자동 검사 뒤 사람이 근거를 검토합니다.",
  );
  await highlight(app.locator(".draft-panel"));
  await app.getByLabel("댓글 초안", { exact: true }).click();
  await hold(4000);
  await app.getByText("댓글의 근거 확인", { exact: true }).click();
  await app.locator(".evidence-details").scrollIntoViewIfNeeded();
  await hold(4000);
  await caption(
    "03",
    "오른쪽 칸 · 유튜브1과 게시 조건 확인",
    "이미 성공한 영상은 재게시가 차단됩니다. 다음 장면은 10월 15일의 실제 첫 게시입니다.",
  );
  await highlight(app.locator(".posting-panel"));
  await app.getByRole("combobox", { name: "게시할 프로필" }).focus();
  await app.locator(".progress").scrollIntoViewIfNeeded();
  await hold(6000);
  await page.screenshot({ path: `${folder}/three-columns.png` });
  if (preview) {
    console.log(`미리보기: ${folder}/three-columns.png`);
    await context.close();
  } else {
    await app.getByRole("combobox", { name: "채널 필터" }).selectOption("UC-ee_ziASM251TMXe3P3VZA");
    await app.locator(".video-card").filter({ hasText: "Live streaming of 리즈시절 LizTV" }).nth(1).click();
    await app.locator(".evidence-details blockquote").filter({ hasText: spokenSample.evidence[0].quote }).waitFor({ state: "attached" });
    await app.locator(".evidence-details").evaluate((el) => {
      (el as HTMLDetailsElement).open = true;
    });
    const spokenQuote = await app.locator(".evidence-details blockquote").first().innerText();
    if (!spokenQuote.includes(spokenSample.evidence[0].quote))
      throw Error("공개 자막에서 확보한 발언과 현재 화면의 근거가 다릅니다.");
    await caption("04", "실제 말 · 5분 30초 공개 자막에서 인용", "‘더 많은 사람을 만나야 되겠다’는 발언과 이 영상의 댓글을 함께 봅니다. 자막 오류 가능성은 사람 검토 대상입니다.");
    await highlight(app.locator(".draft-panel"));
    await app.locator(".evidence-details blockquote").first().scrollIntoViewIfNeeded();
    await hold(7000);
    await page.screenshot({ path: `${folder}/spoken-evidence.png` });

    await app.getByRole("combobox", { name: "채널 필터" }).selectOption("UCVdtDW-HF4KluixGaBAcI4w");
    await app.getByRole("button", { name: /여자들이 좋아하는 남자 대화법 대화 스킬/ }).click();
    await app.locator(".evidence-details blockquote").filter({ hasText: chapterSample.evidence[0].quote }).waitFor({ state: "attached" });
    await app.locator(".evidence-details").evaluate((el) => {
      (el as HTMLDetailsElement).open = true;
    });
    const chapterQuote = await app.locator(".evidence-details blockquote").first().innerText();
    if (!chapterQuote.includes(chapterSample.evidence[0].quote))
      throw Error("영상 설명의 챕터 문구와 현재 화면의 근거가 다릅니다.");
    await caption("05", "다른 영상 · 설명 속 ‘질문 대신 문장’ 챕터", "이 문구는 공개 영상 설명의 챕터입니다. 실제 발언으로 단정하지 않고, 다른 고민과 댓글을 비교합니다.");
    await highlight(app.locator(".draft-panel"));
    await app.locator(".evidence-details blockquote").first().scrollIntoViewIfNeeded();
    await hold(7000);
    await page.screenshot({ path: `${folder}/chapter-evidence.png` });

    await page.goto("http://127.0.0.1:4340");
    await caption("06", "영상마다 다른 근거 → 다른 댓글", "실제 사전 초안 23개는 문구가 모두 다릅니다. 아래 두 개는 출처와 영상별 연결을 사람이 읽어 비교한 사례입니다.");
    await card(
      `<div class="tag">drafts/prepared.json의 실제 두 초안 · 공개 자막과 영상 설명을 구분</div><h1>같은 홍보 문구를 반복하지 않았는가?</h1><div class="comparison"><div class="source"><strong>① 리즈시절 LizTV · 공개 자막 5:30</strong><small>“${escapeHtml(spokenSample.evidence[0].quote)}”</small><p>${escapeHtml(spokenSample.text)}</p></div><div class="source"><strong>② 연애데이터 노노 · 공개 설명의 챕터</strong><small>“${escapeHtml(chapterSample.evidence[0].quote)}”</small><p>${escapeHtml(chapterSample.text)}</p></div></div><p class="muted">형식·근거 검사를 통과한 23개 초안의 텍스트가 서로 다른 것은 자동 확인. 말의 맥락과 자연스러움은 사람이 별도로 검토합니다.</p>`,
    );
    await hold(9000);
    await page.screenshot({ path: `${folder}/two-drafts.png` });
    await caption("07", "시청자 말투와 운명원 관심 유도 검토", "영상의 한 대목 → 내 생각 → 운명원 연애 사주에 대한 질문. 실제 이용 후기·효과 보장·링크는 쓰지 않았습니다.");
    await card(
      `<div class="tag">두 실제 댓글의 문장 흐름을 사람이 검토하는 장면</div><h1>공감이 먼저, 브랜드는 자연스러운 질문으로</h1><div class="source"><strong>① 사람을 더 만나고 싶다는 발언</strong><br>${escapeHtml(spokenSample.text)}</div><div class="source"><strong>② 질문 대신 문장으로 대화하는 방법</strong><br>${escapeHtml(chapterSample.text)}</div><p class="proof">영상별 관찰 → 시청자의 생각 → ‘운명원 연애 사주에서는?’</p><p class="muted">읽은 사람이 실제로 사주를 보고 싶어지는지는 이 시연만으로 입증할 수 없어 사람의 최종 판단이 필요합니다.</p>`,
    );
    await hold(8500);
    await page.screenshot({ path: `${folder}/tone-review.png` });

    await showApp();
    await app.getByRole("combobox", { name: "채널 필터" }).selectOption("UCVdtDW-HF4KluixGaBAcI4w");
    await app.getByRole("button", { name: /여자들이 좋아하는 남자 대화법 대화 스킬/ }).click();
    await app.locator(".selected-title").getByText("여자들이 좋아하는 남자 대화법 대화 스킬").waitFor();
    if (await app.getByRole("button", { name: "댓글 게시하기" }).isEnabled())
      throw Error("테스트 모드에서 운영 채널 게시가 열려 있습니다.");
    await caption("08", "허용 범위 · 5개 채널과 테스트 모드", "현재 테스트 모드에서는 운영 영상의 게시 버튼이 비활성화됩니다. 등록한 본인 테스트 영상만 게시 대상입니다.");
    await highlight(app.locator(".posting-panel"));
    await app.locator(".post-checks").scrollIntoViewIfNeeded();
    await hold(6000);
    await page.screenshot({ path: `${folder}/posting-scope.png` });
    await app.getByRole("combobox", { name: "채널 필터" }).selectOption("test");
    await app.getByRole("button", { name: /내 테스트 영상.*13504572/ }).click();
    await app.locator(".selected-title").getByText(/13504572/).waitFor();
    if (await app.getByRole("button", { name: "댓글 게시하기" }).isEnabled())
      throw Error("이미 게시한 테스트 영상의 재게시 버튼이 열려 있습니다.");
    await caption("09", "영상당 1개 · 하루 상한 · 기존 이력", "10월 15일 게시한 이 영상은 날짜가 바뀌어도 재게시 불가. 화면에서 한국 시간 오늘 한도와 남은 슬롯을 확인합니다.");
    await highlight(app.locator(".posting-panel"));
    await app.locator(".post-checks").scrollIntoViewIfNeeded();
    await hold(6500);
    await page.screenshot({ path: `${folder}/one-per-video-limit.png` });
    await app.locator(".progress").scrollIntoViewIfNeeded();
    await caption("09", "같은 영상의 성공 이력 때문에 재게시 차단", "게시 완료 상태와 댓글 링크가 남아 있고 ‘댓글 게시하기’는 비활성화되어 있습니다.");
    await hold(3000);
    await page.screenshot({ path: `${folder}/one-per-video-history.png` });

    await page.goto("http://127.0.0.1:4340");
    await caption("09+", "경계 조건 · 실제 정책 테스트 16개 통과", "10개 게시 후 11번째 차단, 프로필 변경·서버 재시작 우회 차단, 테스트 모드 범위를 별도 검증합니다.");
    await card(
      '<div class="tag">이번 녹화 직전 tests/store.test.ts · tests/service.test.ts 실제 실행</div><h1>화면 제한을 서버·SQLite에서도 다시 검사</h1><div class="source">✓ 다른 SQLite 연결과 재시작 후에도 영상 잠금 유지</div><div class="source">✓ 다른 프로필로 바꿔도 성공 영상 재게시 차단</div><div class="source">✓ 10개 성공 후 11번째 게시 차단</div><div class="source">✓ 테스트 모드에서 운영 채널 게시 차단</div><p class="proof">정책·서비스 테스트 16개 통과 · 원문 결과: policy-check.txt</p><p class="muted">이 장면은 대역 데이터로 한 경계 테스트입니다. 실제 계정의 게시 확인은 뒤의 원본과 실행 이력으로 별도 보여줍니다.</p>',
    );
    await hold(7000);
    await page.screenshot({ path: `${folder}/policy-tests.png` });

    await page.goto("http://127.0.0.1:4340");
    await caption(
      "10",
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
      "11",
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
    await hold(2500);
    await caption(
      "11",
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
      "12",
      "게시 후 페이지를 새로고침하고 결과 확인",
      "실제 첫 게시 원본 · 이 구간은 1배속 · 서버에 남은 내 댓글인지 다시 확인합니다.",
    );
    await page.waitForFunction(
      () => (document.querySelector("video") as HTMLVideoElement).ended,
      {},
      { timeout: 30_000 },
    );
    await caption(
      "12",
      "내 댓글 확인 · 같은 본문 + 본인 ‘수정’ 메뉴",
      `실제 녹화의 ${confirmationTime}초 정지 장면 · 클릭만으로 성공 처리하지 않습니다.`,
    );
    await card(
      `<div class="tag">2026-10-15 실제 녹화 정지 장면 · 원본 ${confirmationTime}초</div><h1>게시된 댓글 본문과 본인 ‘수정’ 메뉴</h1><p>새로고침 이후에도 동일한 댓글이 있고, 내 댓글의 관리 메뉴가 보입니다.</p><div class="crop"><img src="/confirmation.png" alt="실제 내 댓글과 수정 메뉴"></div>`,
    );
    await hold(8000);
    await page.screenshot({ path: `${folder}/own-comment.png` });
    await showApp();
    await app.getByRole("button", { name: "실행 이력", exact: true }).click();
    await caption(
      "13",
      "앱 실행 이력 · 실제 게시 완료와 원문 보존",
      "현재 실제 앱 · 10월 15일 성공 댓글의 본문·프로필·시각을 영속 이력으로 유지합니다.",
    );
    await hold(6000);
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
    await hold(7000);
    await app
      .getByRole("button", { name: "상승 영상 탐색", exact: true })
      .click();
    await caption(
      "+",
      "상승 영상 탐색 · 실제 관측과 유효 시간 구분",
      "현재는 관측 중지 상태입니다. 10월 15일 55.54분 실측 결과는 기록 문서에 보관했습니다.",
    );
    await hold(5000);
    await app.getByRole("button", { name: "설정", exact: true }).click();
    await caption(
      "14",
      "설정 · 전용 프로필 3개와 API 키 설정 여부",
      "화면에는 키의 설정 여부만 표시하며, 실제 키 값은 로컬 .env에만 둡니다.",
    );
    await hold(5000);
    await page.goto("http://127.0.0.1:4340");
    await caption(
      "15",
      "제출 점검 · Git 비밀값 검사 통과",
      "작업 트리·스테이징·로컬 이력 검사 · 현재 공개 저장소의 제출 파일에 API 키를 넣지 않았습니다.",
    );
    await card(
      '<div class="tag">이번 녹화 직전 실제 검사 결과 · 공개 저장소 제출 후 재검사</div><h1>API 키와 개인 데이터는 제출 파일에서 제외</h1><pre id="audit"></pre><p>.env · .local*/ · Chrome 프로필 · DB · 캡처 원본은 Git에서 제외합니다.</p><p class="muted">검사 명령: npm run secrets:check<br>시연 영상과 문서를 갱신한 뒤 최종 Git 이력도 다시 검사합니다.</p>',
    );
    await page.locator("#audit").evaluate((el, value) => {
      el.textContent = value;
    }, audit.trim());
    await hold(7500);
    await caption(
      "16",
      "오픈소스 출처 · README와 원문 고지 제공",
      "설치 버전 기준 출처·라이선스 · THIRD_PARTY_NOTICES.md · 전체 의존성 목록 제공",
    );
    await card(
      '<div class="tag">오픈소스 크레딧 · package-lock.json으로 버전 고정</div><h1>사용한 라이브러리와 도구의 출처</h1><div class="source">React / React DOM · react.dev · MIT<br>Vite / Vitest · vite.dev / vitest.dev · MIT</div><div class="source">Express · expressjs.com · MIT<br>Playwright · playwright.dev · Apache-2.0<br>OpenAI Node SDK · github.com/openai/openai-node · Apache-2.0</div><div class="source">Lucide 아이콘 · lucide.dev · ISC (일부 Feather MIT)<br>TypeScript · typescriptlang.org · Apache-2.0<br>FFmpeg 녹화 도구 · ffmpeg.org · LGPL-2.1</div><p class="muted">그 외 dotenv, fast-xml-parser, Zod, tsx, Prettier, 타입 패키지와 런타임은<br>README 및 THIRD_PARTY_NOTICES.md에 버전·출처·라이선스를 함께 적었습니다.</p>',
    );
    await hold(7500);
    await caption(
      "✓",
      "영상별 근거·자연스러운 질문·게시 제한 → 실제 타이핑·게시·내 댓글 확인",
      "실제 게시 원본과 현재 앱을 날짜로 구분 · 이력·비밀값 검사·오픈소스 출처 확인",
    );
    await card(
      '<div class="tag">운명원 댓글 스튜디오 · 시연 종료</div><h1>설치부터 실행까지 README에서 재현</h1><pre>npm ci\nnpm run build\nnpm start</pre><p class="proof">실제 테스트 게시 1건 · 같은 본문과 본인 수정 메뉴 확인</p><p class="muted">제출 대상: github.com/cjw1234567/unmyeong-comment-studio<br>남은 인수 항목: 다른 Mac 검증과 근거 보완 초안 2개.</p>',
    );
    await hold(4500);
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

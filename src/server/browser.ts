import { chromium, type BrowserContext, type Page } from "playwright";
import { mkdirSync } from "node:fs";
import { watchUrl } from "../shared/constants.js";
import type {
  AttemptStatus,
  PostingAttempt,
  Video,
  VideoEvidence,
} from "../shared/types.js";
import { AppError, localPath, profilePath } from "./config.js";
import { extractJsonAssignment } from "./youtube.js";

export interface BrowserCallbacks {
  stage: (status: AttemptStatus) => void;
  beforeSubmit: () => void;
  verifyChannel: (channelId: string) => void;
}
export interface Poster {
  post(
    attempt: PostingAttempt,
    callbacks: BrowserCallbacks,
  ): Promise<{ commentUrl: string }>;
  verify(attempt: PostingAttempt): Promise<{ commentUrl: string }>;
}
export class BrowserFailure extends AppError {
  constructor(
    message: string,
    public screenshot?: string,
  ) {
    super("BROWSER", message, 502);
  }
}
export class ExistingCommentFailure extends BrowserFailure {
  constructor(public commentUrl: string) {
    super(
      "화면에서 기존 본인 댓글을 확인했습니다. 이 영상의 추가 게시를 차단했습니다.",
    );
  }
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function restrictPage(context: BrowserContext, videoId: string) {
  await context.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (
      req.isNavigationRequest() &&
      req.frame() === req.frame().page().mainFrame()
    ) {
      if (
        url.hostname !== "www.youtube.com" ||
        url.pathname !== "/watch" ||
        url.searchParams.get("v") !== videoId
      ) {
        await route.abort();
        return;
      }
    }
    // YouTube page assets and its Google-owned delivery endpoints only. No arbitrary third-party tracking.
    const allowed = [
      "youtube.com",
      "ytimg.com",
      "googlevideo.com",
      "gstatic.com",
      "googleapis.com",
      "ggpht.com",
      "googleusercontent.com",
    ];
    if (
      !allowed.some(
        (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
      )
    ) {
      await route.abort();
      return;
    }
    await route.continue();
  });
  context.on("page", (page) => {
    if (context.pages().length > 1) void page.close().catch(() => {});
  });
}
async function launch(
  profile: string,
  videoId: string,
  headless = false,
  record = false,
): Promise<{ context: BrowserContext; page: Page }> {
  mkdirSync(profile, { recursive: true, mode: 0o700 });
  mkdirSync(localPath("browser-artifacts"), { recursive: true, mode: 0o700 });
  let context: BrowserContext;
  try {
    context = await chromium.launchPersistentContext(profile, {
      channel: "chrome",
      headless,
      ...(record
        ? {
            recordVideo: {
              dir: localPath("recordings"),
              size: { width: 1280, height: 900 },
            },
          }
        : {}),
      ignoreDefaultArgs: ["--use-mock-keychain", "--password-store=basic"],
      locale: "ko-KR",
      viewport: { width: 1280, height: 900 },
      acceptDownloads: false,
      serviceWorkers: "block",
      downloadsPath: localPath("browser-artifacts"),
      tracesDir: localPath("browser-artifacts"),
      args: ["--lang=ko-KR", "--no-default-browser-check"],
    });
  } catch {
    throw new BrowserFailure(
      "크롬을 열지 못했습니다. Chrome 설치 여부와 전용 프로필 창이 닫혀 있는지 확인해 주세요.",
    );
  }
  await restrictPage(context, videoId);
  const page = context.pages()[0] || (await context.newPage());
  page.setDefaultTimeout(12_000);
  return { context, page };
}
async function navigate(page: Page, videoId: string) {
  await page.goto(`${watchUrl(videoId)}&hl=ko`, {
    waitUntil: "domcontentloaded",
    timeout: 35_000,
  });
  await page.locator("ytd-watch-flexy").waitFor({ timeout: 25_000 });
  await page
    .locator("video")
    .evaluateAll((els) =>
      els.forEach((el) => (el as HTMLVideoElement).pause()),
    );
}
async function pageChannel(page: Page): Promise<string> {
  const videoId = new URL(page.url()).searchParams.get("v");
  let channelId = await page
    .locator('meta[itemprop="channelId"]')
    .getAttribute("content", { timeout: 500 })
    .catch(() => null);
  if (!channelId) {
    // Public player metadata in the page's script element; never read browser storage or cookies.
    const scripts = await page.locator("script").allTextContents();
    for (const script of scripts) {
      if (!script.includes("ytInitialPlayerResponse")) continue;
      try {
        const data = extractJsonAssignment(
          script,
          "ytInitialPlayerResponse",
        ) as { videoDetails?: { videoId: string; channelId: string } };
        if (data.videoDetails?.videoId === videoId) {
          channelId = data.videoDetails.channelId;
          break;
        }
      } catch {
        /* This script may only reference the variable. */
      }
    }
  }
  if (!channelId || !/^UC[\w-]{22}$/.test(channelId))
    throw new BrowserFailure(
      "현재 영상의 채널을 화면에서 검증하지 못했습니다. 게시를 중단합니다.",
    );
  return channelId;
}
async function commentSection(page: Page) {
  await page.locator("ytd-comments#comments").scrollIntoViewIfNeeded();
  await page
    .locator("ytd-comment-simplebox-renderer")
    .waitFor({ timeout: 20_000 });
}
async function findOwnComment(
  page: Page,
  text?: string,
): Promise<string | undefined> {
  const comments = page.locator("ytd-comment-thread-renderer");
  const count = Math.min(await comments.count(), 100);
  for (let i = 0; i < count; i++) {
    const row = comments.nth(i);
    const body = await row
      .locator("#content-text")
      .first()
      .innerText()
      .catch(() => "");
    if (
      text !== undefined &&
      body.trim().normalize("NFC") !== text.trim().normalize("NFC")
    )
      continue;
    const menu = row
      .locator("#action-menu button, ytd-menu-renderer yt-icon-button button")
      .first();
    if (!(await menu.isVisible().catch(() => false))) continue;
    await menu.click();
    const edit = page.getByRole("menuitem", { name: /수정|Edit/ }).first();
    await edit.waitFor({ state: "visible", timeout: 800 }).catch(() => {});
    const own = await edit.isVisible().catch(() => false);
    await page.keyboard.press("Escape");
    if (!own) continue;
    const link = await row
      .locator('a[href*="lc="]')
      .first()
      .getAttribute("href")
      .catch(() => null);
    if (link) {
      const url = new URL(link, "https://www.youtube.com");
      if (
        url.hostname === "www.youtube.com" &&
        url.pathname === "/watch" &&
        url.searchParams.get("v") === new URL(page.url()).searchParams.get("v")
      )
        return url.toString();
    }
    return watchUrl(new URL(page.url()).searchParams.get("v")!);
  }
}
export class ChromePoster implements Poster {
  async execute(attempt: PostingAttempt, callbacks?: BrowserCallbacks) {
    let context: BrowserContext | undefined, page: Page | undefined;
    try {
      callbacks?.stage("opening");
      ({ context, page } = await launch(
        profilePath(attempt.profileId),
        attempt.videoId,
        false,
        process.env.RECORD_POSTING === "1",
      ));
      callbacks?.stage("loading");
      await navigate(page, attempt.videoId);
      const channel = await pageChannel(page);
      callbacks?.verifyChannel(channel);
      await commentSection(page);
      if (
        await page
          .getByRole("link", { name: /^로그인$|^Sign in$/ })
          .first()
          .isVisible()
          .catch(() => false)
      )
        throw new BrowserFailure(
          "전용 Chrome에서 YouTube 로그인을 확인할 수 없습니다. 로그인 창에서 로그인한 뒤 Chrome 메뉴의 종료를 선택해 주세요.",
        );
      if (callbacks) {
        const existing = await findOwnComment(page);
        if (existing) throw new ExistingCommentFailure(existing);
        const placeholder = page.locator("#simplebox-placeholder").first();
        await placeholder.click();
        const editor = page
          .locator('#contenteditable-root[contenteditable="true"]')
          .first();
        await editor.waitFor();
        callbacks.stage("typing");
        for (const { segment } of new Intl.Segmenter("ko", {
          granularity: "grapheme",
        }).segment(attempt.text)) {
          await editor.pressSequentially(segment, { delay: 0 });
          await wait(45);
        }
        if (
          (await editor.innerText()).normalize("NFC") !==
          attempt.text.normalize("NFC")
        )
          throw new BrowserFailure(
            "입력된 댓글이 초안과 다릅니다. 게시하지 않았습니다.",
          );
        const submit = page
          .locator("ytd-comment-simplebox-renderer #submit-button")
          .getByRole("button")
          .first();
        if (!(await submit.isEnabled()))
          throw new BrowserFailure(
            "댓글 게시 버튼이 비활성화되어 있습니다. 로그인·댓글 권한을 확인해 주세요.",
          );
        callbacks.verifyChannel(await pageChannel(page));
        callbacks.beforeSubmit();
        await submit.click();
        callbacks.stage("verifying");
      }
      for (let i = 0; i < 8; i++) {
        const found = await findOwnComment(page, attempt.text);
        if (found) break;
        await wait(1500);
      }
      // Refresh once: this also avoids mistaking a local optimistic insertion for a persisted comment.
      await page.reload({ waitUntil: "domcontentloaded" });
      await commentSection(page);
      const found = await findOwnComment(page, attempt.text);
      if (found) return { commentUrl: found };
      throw new BrowserFailure(
        "게시된 본인 댓글을 확인하지 못했습니다. 자동으로 다시 게시하지 않습니다.",
      );
    } catch (error) {
      let screenshot: string | undefined;
      if (
        page &&
        !page.isClosed() &&
        page.url().startsWith(watchUrl(attempt.videoId))
      ) {
        try {
          mkdirSync(localPath("screenshots"), { recursive: true, mode: 0o700 });
          screenshot = `${attempt.id}.png`;
          await page.screenshot({
            path: localPath(`screenshots/${screenshot}`),
            fullPage: false,
          });
        } catch {
          screenshot = undefined;
        }
      }
      if (error instanceof ExistingCommentFailure) {
        error.screenshot = screenshot;
        throw error;
      }
      throw new BrowserFailure(
        error instanceof AppError
          ? error.message
          : "유튜브 화면에서 작업을 완료하지 못했습니다. 로그인·댓글 사용 가능 여부와 화면 변경을 확인해 주세요.",
        screenshot,
      );
    } finally {
      await context?.close().catch(() => {});
    }
  }
  post(attempt: PostingAttempt, callbacks: BrowserCallbacks) {
    return this.execute(attempt, callbacks);
  }
  verify(attempt: PostingAttempt) {
    return this.execute(attempt);
  }
}
let readerQueue: Promise<unknown> = Promise.resolve();
export function readVideoEvidence(video: Video): Promise<VideoEvidence> {
  const work = readerQueue.then(() => readEvidence(video));
  readerQueue = work.catch(() => {});
  return work;
}
async function readEvidence(video: Video): Promise<VideoEvidence> {
  let context: BrowserContext | undefined;
  const result: VideoEvidence = {
    videoId: video.id,
    title: video.title,
    description: video.description,
    transcript: [],
    comments: [],
    transcriptStatus: "unavailable",
    commentsStatus: "unavailable",
    fetchedAt: new Date().toISOString(),
    notes: [],
  };
  try {
    const browser = await launch(localPath("reader-profile"), video.id, true);
    context = browser.context;
    const page = browser.page;
    await navigate(page, video.id);
    if ((await pageChannel(page)) !== video.channelId)
      throw new BrowserFailure(
        "영상의 채널 정보가 변경되었거나 확인되지 않습니다.",
      );
    await page
      .locator("#description-inline-expander #expand")
      .click({ timeout: 4000 })
      .catch(() => {});
    const desc = await page
      .locator("#description-inline-expander")
      .innerText()
      .catch(() => "");
    if (desc) result.description = desc;
    const transcriptButton = page
      .getByRole("button", { name: /스크립트 표시|Show transcript/i })
      .first();
    if (await transcriptButton.isVisible().catch(() => false)) {
      await transcriptButton.click();
      await page
        .locator("ytd-transcript-segment-renderer")
        .first()
        .waitFor({ timeout: 8000 })
        .catch(() => {});
      result.transcript = await page
        .locator("ytd-transcript-segment-renderer")
        .evaluateAll((rows) =>
          rows
            .map((row) => ({
              text:
                row.querySelector(".segment-text")?.textContent?.trim() || "",
              timestamp: row
                .querySelector(".segment-timestamp")
                ?.textContent?.trim(),
            }))
            .filter((x) => x.text),
        );
      if (result.transcript.length) result.transcriptStatus = "available";
    }
    await page.locator("ytd-comments#comments").scrollIntoViewIfNeeded();
    await page
      .locator("ytd-comment-thread-renderer")
      .first()
      .waitFor({ timeout: 10_000 })
      .catch(() => {});
    result.comments = await page
      .locator("ytd-comment-thread-renderer #content-text")
      .allInnerTexts();
    result.comments = result.comments.slice(0, 20);
    result.commentsStatus = result.comments.length ? "available" : "empty";
    if (!result.transcript.length)
      result.notes.push(
        "공개 자막을 확보하지 못해 제목·설명을 근거로 사용합니다.",
      );
  } catch (error) {
    result.notes.push(
      error instanceof AppError
        ? error.message
        : "화면 자료 수집에 실패했습니다. 확보한 제목·설명만 표시합니다.",
    );
  } finally {
    await context?.close().catch(() => {});
  }
  return result;
}

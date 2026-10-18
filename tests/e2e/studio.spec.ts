import { test, expect } from "@playwright/test";
test("초안 검토, 모의 게시, 이력, 상승 탐색, 설정을 연결한다", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByText("화면 체험 모드", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /내 테스트 영상.*연락의 횟수/ })
    .click();
  await expect(page.getByLabel("댓글 초안", { exact: true })).toContainText(
    "운명원",
  );
  await page
    .getByRole("button", { name: "모의 게시 실행", exact: true })
    .click();
  await expect(page.getByText("게시 완료", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "모의 게시 실행", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "실행 이력", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "게시 실행 기록" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "상승 영상 탐색", exact: true })
    .click();
  await expect(
    page.getByText("상승 후보", { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "초안", exact: true }).first().click();
  await expect(
    page.getByRole("heading", { name: "탐색 전용 초안" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "설정", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "크롬 전용 프로필" }),
  ).toBeVisible();
});
test("편집한 초안을 저장하기 전에는 게시하지 않는다", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: /좋아하는 사람 앞에서 자꾸 작아지는 이유/ })
    .click();
  const comment = page.getByLabel("댓글 초안", { exact: true });
  await comment.fill("너무 짧은 운명원 댓글");
  await expect(page.getByText(/현재 12자/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "모의 게시 실행", exact: true }),
  ).toBeDisabled();
});
test("작은 화면에서 가로 넘침 없이 작동한다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "영상의 맥락을, 대화의 시작으로." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("다른 출처와 인증 없는 게시 요청을 거절한다", async ({ request }) => {
  const response = await request.post("/api/attempts", { data: {} });
  expect(response.status()).toBe(403);
  const foreign = await request.get("/api/bootstrap", {
    headers: { Origin: "https://evil.example" },
  });
  expect(foreign.status()).toBe(403);
  const host = await request.get("/api/bootstrap", {
    headers: { Host: "evil.example" },
  });
  expect(host.status()).toBe(403);
});
test("새로고침 후 저장된 이력을 복원한다", async ({ page }) => {
  await page.goto("/");
  await page.reload();
  await page.getByRole("button", { name: "실행 이력", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "게시 실행 기록" }),
  ).toBeVisible();
  await expect(page.getByText("게시 완료", { exact: true })).toBeVisible();
});
test("키가 없어도 사전 초안을 읽고 새 초안이 없는 상태를 구분한다", async ({
  page,
}) => {
  await page.route("**/api/state", async (route) => {
    const response = await route.fetch();
    const state = await response.json();
    await route.fulfill({
      json: { ...state, openaiConfigured: false, youtubeConfigured: false },
    });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: /좋아하는 사람 앞에서 자꾸 작아지는 이유/ })
    .click();
  await expect(page.getByLabel("댓글 초안", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "다시 생성", exact: true }),
  ).toBeDisabled();
  await page.route("**/api/videos/*/draft", (route) =>
    route.fulfill({ json: null }),
  );
  await page.reload();
  await page
    .getByRole("button", { name: /좋아하는 사람 앞에서 자꾸 작아지는 이유/ })
    .click();
  await expect(
    page.getByText("아직 준비된 초안이 없어요", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "AI 초안 생성", exact: true }),
  ).toBeDisabled();
});
test("부분 수집 실패를 성공 안내와 구분해 보여준다", async ({ page }) => {
  await page.route("**/api/videos/refresh", (route) =>
    route.fulfill({
      json: { videos: [], errors: ["외롭여: 최신 목록 조회 실패"] },
    }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "영상 불러오기", exact: true })
    .click();
  await expect(
    page.getByText("일부 채널은 저장된 목록을 표시합니다.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("1개 수집 알림", { exact: true })).toBeVisible();
});

import { describe, it, expect } from "vitest";
import {
  charCount,
  parseVideoId,
  seoulDate,
  validateText,
  validateEvidence,
} from "../src/shared/validation.js";
import { fixtureVideos, fixtureDraft, fixtureEvidence } from "./fixtures.js";
describe("댓글과 URL 정책", () => {
  it.each([39, 40, 120, 121])("%i자 경계를 검사한다", (n) => {
    const s = "운명원" + "가".repeat(n - 3);
    expect(validateText(s).length === 0).toBe(n >= 40 && n <= 120);
  });
  it("결합 문자와 이모지를 사용자 표시 문자로 센다", () => {
    expect(charCount("가👨‍👩‍👧‍👦👍🏽")).toBe(3);
  });
  it("링크·해시태그·브랜드 누락·중복을 거절한다", () => {
    const base = fixtureDraft(fixtureVideos[0]).text;
    expect(
      validateText(base + " https://example.com").some((e) =>
        e.includes("링크"),
      ),
    ).toBe(true);
    expect(
      validateText(base + " #연애").some((e) => e.includes("해시태그")),
    ).toBe(true);
    expect(
      validateText(base.replace("운명원", "어떤곳")).some((e) =>
        e.includes("운명원"),
      ),
    ).toBe(true);
    expect(
      validateText(base, [base.replaceAll(" ", "")]).some((e) =>
        e.includes("동일"),
      ),
    ).toBe(true);
  });
  it.each([
    "https://youtu.be/DcvvWjExea4",
    "https://www.youtube.com/watch?v=DcvvWjExea4&t=10",
    "https://youtube.com/shorts/DcvvWjExea4",
    "DcvvWjExea4",
  ])("영상 ID를 안전하게 추출한다: %s", (url) =>
    expect(parseVideoId(url)).toBe("DcvvWjExea4"),
  );
  it.each([
    "https://youtube.com.evil.test/watch?v=DcvvWjExea4",
    "https://evil.test/?v=DcvvWjExea4",
    "file:///etc/passwd",
    "https://user@youtube.com/watch?v=DcvvWjExea4",
    "http://127.0.0.1/watch?v=DcvvWjExea4",
    "https://youtube.com:8080/watch?v=DcvvWjExea4",
  ])("외부·위장 주소를 거절한다: %s", (url) =>
    expect(() => parseVideoId(url)).toThrow(),
  );
  it("인기 댓글을 영상 발언의 근거로 간주하지 않는다", () => {
    const v = fixtureVideos[0],
      e = fixtureEvidence(v),
      d = fixtureDraft(v);
    d.evidence = [{ source: "transcript", quote: e.comments[0] }];
    expect(validateEvidence(d, e)).toHaveLength(1);
  });
  it("한국 시간 자정 경계를 처리한다", () => {
    expect(seoulDate(new Date("2026-10-15T14:59:59Z"))).toBe("2026-10-15");
    expect(seoulDate(new Date("2026-10-15T15:00:00Z"))).toBe("2026-10-16");
  });
});

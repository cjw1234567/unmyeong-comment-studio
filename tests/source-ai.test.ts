import { describe, it, expect, vi } from "vitest";
import {
  extractJsonAssignment,
  parseFeed,
  YouTubeSource,
} from "../src/server/youtube.js";
import { validateGenerated } from "../src/server/ai.js";
import { CHANNELS } from "../src/shared/constants.js";
import { fixtureVideos, fixtureEvidence, fixtureDraft } from "./fixtures.js";
describe("외부 자료 파싱과 생성 검증", () => {
  it("RSS 일부 오류의 HTTP 원인을 표시하고 성공한 채널은 보존한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const i = CHANNELS.findIndex((c) => url.includes(c.id));
        if (i === 0) return new Response("upstream detail", { status: 404 });
        const channel = CHANNELS[i];
        return new Response(
          `<feed><yt:channelId>${channel.id}</yt:channelId><entry><yt:videoId>feedVideo0${i}</yt:videoId><yt:channelId>${channel.id}</yt:channelId><title>공개 영상</title></entry></feed>`,
        );
      }),
    );
    try {
      const result = await new YouTubeSource().latest();
      expect(result.videos).toHaveLength(4);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("HTTP 404");
      expect(result.errors[0]).not.toContain("upstream detail");
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("스크립트를 실행하지 않고 중괄호 포함 JSON을 읽는다", () => {
    expect(
      extractJsonAssignment(
        'var ytInitialPlayerResponse = {"x":"a}b","nested":{"x":1}}; alert(1);',
        "ytInitialPlayerResponse",
      ),
    ).toEqual({ x: "a}b", nested: { x: 1 } });
  });
  it("RSS의 채널 ID를 검증한다", () => {
    expect(() =>
      parseFeed("<feed><yt:channelId>wrong</yt:channelId></feed>", CHANNELS[0]),
    ).toThrow();
  });
  it("실제 RSS처럼 최상위 UC 접두사가 생략되어도 항목의 전체 채널 ID를 검증한다", () => {
    const xml = `<feed><yt:channelId>${CHANNELS[0].id.slice(2)}</yt:channelId><entry><yt:videoId>demoVid0001</yt:videoId><yt:channelId>${CHANNELS[0].id}</yt:channelId><title>실제 응답 형태</title></entry></feed>`;
    expect(parseFeed(xml, CHANNELS[0])).toHaveLength(1);
  });
  it("RSS 다섯 개와 한 개 형태를 읽는다", () => {
    const xml = `<feed><yt:channelId>${CHANNELS[0].id}</yt:channelId><entry><yt:videoId>demoVid0001</yt:videoId><yt:channelId>${CHANNELS[0].id}</yt:channelId><title>영상 제목</title></entry></feed>`;
    expect(parseFeed(xml, CHANNELS[0])[0].title).toBe("영상 제목");
  });
  it("환각 근거를 거절하고 부족한 자료를 완료 처리하지 않는다", () => {
    const e = fixtureEvidence(fixtureVideos[0]);
    const d = fixtureDraft(fixtureVideos[0]);
    const value = {
      summary: d.summary,
      text: d.text,
      evidence: [
        {
          source: "transcript" as const,
          quote: "존재하지 않는 발언",
          timestamp: null,
        },
      ],
      insufficient: false,
      reason: "",
    };
    expect(
      validateGenerated(value, e, "posting", []).validationErrors,
    ).toContain("근거 발췌가 실제 영상 자료와 일치하지 않습니다.");
    expect(() =>
      validateGenerated({ ...value, insufficient: true }, e, "posting", []),
    ).toThrow(/자료/);
  });
});

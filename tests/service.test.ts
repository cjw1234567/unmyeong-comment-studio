import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { Store } from "../src/server/store.js";
import { Studio } from "../src/server/service.js";
import {
  BrowserFailure,
  ExistingCommentFailure,
} from "../src/server/browser.js";
import {
  seedFixtures,
  fixtureVideos,
  fixtureSource,
  TEST_ID,
} from "./fixtures.js";
describe("게시 실행 실패 처리", () => {
  it("발견한 기존 본인 댓글을 영속 차단하고 슬롯은 소비하지 않는다", async () => {
    const s = new Store(":memory:");
    seedFixtures(s);
    const studio = new Studio(s, {
      testIds: () => [TEST_ID],
      source: fixtureSource,
      poster: {
        post: async () => {
          throw new ExistingCommentFailure(
            `https://www.youtube.com/watch?v=${TEST_ID}`,
          );
        },
        verify: async () => {
          throw Error();
        },
      },
    });
    const input = {
      videoId: TEST_ID,
      profileId: "youtube1",
      draftRevision: 1,
      requestKey: randomUUID(),
    };
    const a = studio.start(input);
    await studio.idle();
    expect(s.attempt(a.id)?.status).toBe("blocked");
    expect(s.quota().occupiedSlots).toBe(0);
    expect(() => studio.start({ ...input, requestKey: randomUUID() })).toThrow(
      /이미 게시/,
    );
    s.close();
  });
  it("탐색 자료 수집은 게시용 근거와 검토 초안을 덮어쓰지 않는다", async () => {
    const s = new Store(":memory:");
    seedFixtures(s);
    const original = s.evidence(TEST_ID);
    const studio = new Studio(s, {
      source: {
        ...fixtureSource,
        publicEvidence: async (v) => ({
          ...original!,
          videoId: v.id,
          description: "탐색 API 설명",
        }),
      },
    });
    await studio.evidence(TEST_ID, "discovery");
    expect(s.evidence(TEST_ID)).toEqual(original);
    expect(s.evidence(TEST_ID, "discovery")?.description).toBe("탐색 API 설명");
    s.close();
  });
  for (const afterSubmit of [false, true])
    it(`${afterSubmit ? "게시 후" : "게시 전"} 실패를 구분한다`, async () => {
      const store = new Store(":memory:");
      seedFixtures(store);
      let calls = 0;
      const studio = new Studio(store, {
        testIds: () => [TEST_ID],
        source: fixtureSource,
        poster: {
          post: async (_a, cb) => {
            calls++;
            cb.stage("typing");
            if (afterSubmit) cb.beforeSubmit();
            throw new BrowserFailure("강제 실패");
          },
          verify: async () => {
            throw new BrowserFailure("아직 확인되지 않음");
          },
        },
      });
      const a = studio.start({
        videoId: TEST_ID,
        profileId: "youtube1",
        draftRevision: store.draft(TEST_ID)!.revision,
        requestKey: randomUUID(),
      });
      await studio.idle();
      expect(store.attempt(a.id)?.status).toBe(
        afterSubmit ? "uncertain" : "failed",
      );
      expect(calls).toBe(1);
      store.close();
    });
  it("테스트 모드는 운영 채널 게시를 차단한다", () => {
    const s = new Store(":memory:");
    seedFixtures(s);
    const studio = new Studio(s, { testIds: () => [TEST_ID] });
    expect(() =>
      studio.start({
        videoId: fixtureVideos[1].id,
        profileId: "youtube1",
        draftRevision: 1,
        requestKey: randomUUID(),
      }),
    ).toThrow(/테스트 모드/);
    s.close();
  });
  it("탐색 전용 영상·초안은 심사 모드에도 직접 게시 불가다", () => {
    const s = new Store(":memory:");
    seedFixtures(s);
    const v = {
      ...fixtureVideos[1],
      id: "discover001",
      scope: "discovery" as const,
    };
    s.upsertVideo(v);
    s.saveSettings({ ...s.settings(), mode: "review" });
    const studio = new Studio(s);
    expect(() => studio.eligible(v)).toThrow(/허용 영상/);
    s.close();
  });
});

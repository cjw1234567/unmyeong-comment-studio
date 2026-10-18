import { beforeEach, afterEach, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../src/server/store.js";
import {
  seedFixtures,
  fixtureVideos,
  TEST_ID,
  fixtureDraft,
  fixtureEvidence,
} from "./fixtures.js";
let store: Store;
const noOp = () => {};
function request(videoId = TEST_ID) {
  return {
    videoId,
    profileId: store.nextProfile(),
    draftRevision: store.draft(videoId)!.revision,
    requestKey: randomUUID(),
  };
}
beforeEach(() => {
  store = new Store(":memory:");
  seedFixtures(store);
});
afterEach(() => store.close());
describe("영속 게시 정책", () => {
  it("별도 SQLite 연결과 재실행에도 제출 예약과 영상 잠금이 유지된다", () => {
    const folder = mkdtempSync(join(tmpdir(), "studio-test-"));
    const file = join(folder, "studio.sqlite");
    const a = new Store(file);
    seedFixtures(a);
    const input = {
      videoId: TEST_ID,
      profileId: "youtube1",
      draftRevision: 1,
      requestKey: randomUUID(),
    };
    const attempt = a.reserve(input, noOp).attempt;
    const b = new Store(file);
    expect(() =>
      b.reserve({ ...input, requestKey: randomUUID() }, noOp),
    ).toThrow(/진행 중/);
    a.markSubmitting(attempt.id, noOp);
    a.close();
    b.close();
    const reopened = new Store(file);
    reopened.recoverInterrupted();
    expect(reopened.attempt(attempt.id)?.status).toBe("uncertain");
    reopened.saveSettings({
      ...reopened.settings(),
      selectedProfileId: "youtube2",
    });
    expect(() =>
      reopened.reserve(
        { ...input, profileId: "youtube2", requestKey: randomUUID() },
        noOp,
      ),
    ).toThrow(/이미 게시/);
    reopened.close();
    rmSync(folder, { recursive: true });
  });
  it("동일 요청 키 재전송은 같은 실행을 돌려준다", () => {
    const input = request();
    const a = store.reserve(input, noOp);
    expect(store.reserve(input, noOp)).toEqual({
      attempt: a.attempt,
      created: false,
    });
    expect(store.attempts()).toHaveLength(1);
  });
  it("동시에 다른 영상 작업도 시작하지 못한다", () => {
    store.reserve(request(), noOp);
    expect(() => store.reserve(request(fixtureVideos[1].id), noOp)).toThrow(
      /진행 중/,
    );
  });
  it("다른 계정으로 바꿔도 성공 영상 재게시를 차단한다", () => {
    const a = store.reserve(request(), noOp).attempt;
    store.markSubmitting(a.id, noOp);
    store.finish(a.id, "succeeded");
    store.saveSettings({ ...store.settings(), selectedProfileId: "youtube2" });
    expect(() => store.reserve(request(), noOp)).toThrow(/이미 게시/);
  });
  it("검토하지 않은 초안과 오래된 버전을 차단한다", () => {
    const d = store.draft(TEST_ID)!;
    store.saveDraft({ ...d, reviewed: false });
    expect(() =>
      store.reserve({ ...request(), draftRevision: d.revision }, noOp),
    ).toThrow(/초안이 변경/);
    expect(() => store.reserve(request(), noOp)).toThrow(/검토/);
  });
  it("결과 미확정 건은 날짜가 바뀌어도 슬롯을 점유한다", () => {
    store.saveSettings({ ...store.settings(), dailyLimit: 1 });
    const a = store.reserve(
      request(),
      noOp,
      new Date("2026-10-15T14:59:00Z"),
    ).attempt;
    store.markSubmitting(a.id, noOp, new Date("2026-10-15T14:59:00Z"));
    store.finish(a.id, "uncertain");
    expect(store.quota(new Date("2026-10-16T02:00:00Z")).occupiedSlots).toBe(1);
    expect(() =>
      store.reserve(
        request(fixtureVideos[1].id),
        noOp,
        new Date("2026-10-16T02:00:00Z"),
      ),
    ).toThrow(/상한/);
  });
  it("게시 직전 날짜를 다시 배정한다", () => {
    const a = store.reserve(
      request(),
      noOp,
      new Date("2026-10-15T14:59:00Z"),
    ).attempt;
    const submitted = store.markSubmitting(
      a.id,
      noOp,
      new Date("2026-10-15T15:01:00Z"),
    );
    expect(submitted.quotaDate).toBe("2026-10-16");
  });
  it("게시 전 종료는 재시도 가능, 게시 후 종료는 확인 필요다", () => {
    const a = store.reserve(request(), noOp).attempt;
    store.recoverInterrupted();
    expect(store.attempt(a.id)?.status).toBe("failed");
    const b = store.reserve(request(), noOp).attempt;
    store.markSubmitting(b.id, noOp);
    store.recoverInterrupted();
    expect(store.attempt(b.id)?.status).toBe("uncertain");
    expect(() => store.reserve(request(), noOp)).toThrow(/이미 게시/);
  });
  it("성공한 뒤에만 순환 프로필이 바뀐다", () => {
    store.saveSettings({ ...store.settings(), rotation: true });
    const a = store.reserve(request(), noOp).attempt;
    store.finish(a.id, "failed");
    expect(store.nextProfile()).toBe("youtube1");
    const b = store.reserve(request(), noOp).attempt;
    store.markSubmitting(b.id, noOp);
    store.finish(b.id, "succeeded");
    expect(store.nextProfile()).toBe("youtube2");
  });
  it("10개 성공 후 11번째 게시를 막는다", () => {
    for (let i = 0; i < 11; i++) {
      const v = {
        ...fixtureVideos[0],
        id: `limitVid0${String(i).padStart(2, "0")}`,
        title: `별개의 구체적인 영상 ${i}`,
      };
      store.upsertVideo(v);
      store.saveEvidence(fixtureEvidence(v));
      store.saveDraft({
        ...fixtureDraft(v),
        text: `${i}번째 영상에서 관계의 균형을 돌아보라는 구체적인 말이 인상적이네요. 나와 맞는 인연은 어떨지 운명원 연애 사주도 궁금해요.`,
      });
      if (i < 10) {
        const a = store.reserve(request(v.id), noOp).attempt;
        store.markSubmitting(a.id, noOp);
        store.finish(a.id, "succeeded");
      } else expect(() => store.reserve(request(v.id), noOp)).toThrow(/상한/);
    }
    expect(store.quota().todaySuccess).toBe(10);
  });
});

import { describe, it, expect, vi } from "vitest";
import { measureVelocity, Discovery } from "../src/server/discovery.js";
import { fixtureVideos, fixtureSource } from "./fixtures.js";
import { Store } from "../src/server/store.js";
const v = fixtureVideos[1],
  now = new Date("2026-10-15T12:00:00Z");
const snapshot = (views: number, ago: number) => ({
  videoId: v.id,
  views,
  observedAt: new Date(now.getTime() - ago * 60_000).toISOString(),
});
describe("상승 영상 실측", () => {
  it("가상 시계 1시간 동안 다섯 번 실측하고 재시작은 자동 관측하지 않는다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const s = new Store(":memory:");
    let views = 1000;
    const search = vi.fn(async () => [{ ...v, scope: "discovery" as const }]);
    const d = new Discovery(
      s,
      {
        ...fixtureSource,
        search,
        viewCounts: async () => new Map([[v.id, (views += 40)]]),
      },
      () => {},
      () => true,
    );
    try {
      await d.start();
      await vi.advanceTimersByTimeAsync(3600_000);
      expect(s.snapshots(v.id)).toHaveLength(5);
      expect(d.results()[0].hourlyGain).toBe(160);
      expect(search).toHaveBeenCalledTimes(2);
      d.stop();
      const restarted = new Discovery(
        s,
        fixtureSource,
        () => {},
        () => true,
      );
      expect(restarted.running).toBe(false);
      expect(restarted.results()[0].hourlyGain).toBe(160);
      restarted.stop();
    } finally {
      d.stop();
      s.close();
      vi.useRealTimers();
    }
  });
  it("후보와 관측치 보관 상한을 지킨다", () => {
    const s = new Store(":memory:");
    for (let i = 0; i < 205; i++)
      s.addCandidate(
        {
          ...v,
          id: `poolVid${String(i).padStart(4, "0")}`,
          scope: "discovery",
        },
        new Date(now.getTime() + i * 1000).toISOString(),
      );
    s.pruneCandidates();
    expect(s.candidates()).toHaveLength(200);
    expect(
      s.db
        .prepare("SELECT COUNT(*) AS n FROM videos WHERE scope='discovery'")
        .get()?.n,
    ).toBe(200);
    for (let i = 0; i < 205; i++)
      s.addSnapshot({
        videoId: v.id,
        views: 1000 + i,
        observedAt: new Date(now.getTime() + i * 1000).toISOString(),
      });
    expect(s.db.prepare("SELECT COUNT(*) AS n FROM snapshots").get()?.n).toBe(
      200,
    );
    s.close();
  });
  it("처음에는 관측 대기이고 평균 조회수로 대신하지 않는다", () =>
    expect(measureVelocity(v, [snapshot(1500, 0)], now).status).toBe(
      "waiting",
    ));
  it.each([
    [1000, 150, true],
    [5000, 150, true],
    [999, 150, false],
    [5001, 150, false],
    [1800, 149, false],
  ])("%i 조회, 증가 %i 경계", (views, gain, expected) => {
    const r = measureVelocity(
      v,
      [snapshot(Number(views), 0), snapshot(Number(views) - Number(gain), 60)],
      now,
    );
    expect(r.status === "candidate").toBe(expected);
  });
  it("실제 경과 시간으로 정규화한다", () => {
    expect(
      measureVelocity(v, [snapshot(2000, 0), snapshot(1850, 55)], now)
        .hourlyGain,
    ).toBeCloseTo(163.636);
  });
  it("관측 공백과 오래된 값, 감소를 구분한다", () => {
    expect(
      measureVelocity(v, [snapshot(2000, 0), snapshot(1000, 80)], now).status,
    ).toBe("waiting");
    expect(
      measureVelocity(v, [snapshot(2000, 25), snapshot(1000, 85)], now).status,
    ).toBe("stale");
    expect(
      measureVelocity(v, [snapshot(2000, 0), snapshot(2100, 60)], now).status,
    ).toBe("invalid");
  });
  it("API 오류를 노출 없이 상태에 기록한다", async () => {
    const store = new Store(":memory:");
    const d = new Discovery(
      store,
      {
        ...fixtureSource,
        search: async () => {
          throw Error("secret upstream url");
        },
      },
      () => {},
      () => true,
    );
    await d.start();
    expect(d.status().error).not.toContain("secret");
    d.stop();
    store.close();
  });
});

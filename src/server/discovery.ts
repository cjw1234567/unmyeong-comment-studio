import type { DiscoveryResult, Video, ViewSnapshot } from "../shared/types.js";
import { AppError, safeError } from "./config.js";
import type { VideoSource } from "./youtube.js";
import type { Store } from "./store.js";

export function measureVelocity(
  video: Video,
  snapshots: ViewSnapshot[],
  now = new Date(),
): DiscoveryResult {
  const sorted = [...snapshots].sort((a, b) =>
    b.observedAt.localeCompare(a.observedAt),
  );
  const latest = sorted[0];
  const result: DiscoveryResult = {
    video,
    views: latest?.views ?? null,
    hourlyGain: null,
    intervalMinutes: null,
    status: "waiting",
    lastObservedAt: latest?.observedAt,
  };
  if (!latest) return result;
  if (
    Date.parse(latest.observedAt) > now.getTime() ||
    now.getTime() - Date.parse(latest.observedAt) > 20 * 60_000
  )
    return { ...result, status: "stale" };
  const old = sorted
    .slice(1)
    .map((s) => ({
      s,
      minutes:
        (Date.parse(latest.observedAt) - Date.parse(s.observedAt)) / 60_000,
    }))
    .filter((x) => x.minutes >= 55 && x.minutes <= 65)
    .sort((a, b) => Math.abs(a.minutes - 60) - Math.abs(b.minutes - 60))[0];
  if (!old) return result;
  if (latest.views < old.s.views)
    return { ...result, status: "invalid", intervalMinutes: old.minutes };
  const gain = ((latest.views - old.s.views) * 60) / old.minutes;
  return {
    ...result,
    hourlyGain: gain,
    intervalMinutes: old.minutes,
    status:
      latest.views >= 1000 && latest.views <= 5000 && gain >= 150
        ? "candidate"
        : "watching",
  };
}
export class Discovery {
  running = false;
  error: string | null = null;
  lastSearchAt: string | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;
  private pending = false;
  constructor(
    private store: Store,
    private source: VideoSource,
    private emit: () => void,
    private configured: () => boolean = () =>
      Boolean(process.env.YOUTUBE_API_KEY),
  ) {
    this.lastSearchAt = store.get("lastSearchAt", null);
  }
  status() {
    return {
      running: this.running,
      error: this.error,
      lastSearchAt: this.lastSearchAt,
    };
  }
  results() {
    return this.store
      .candidates()
      .map((v) => measureVelocity(v, this.store.snapshots(v.id)))
      .sort((a, b) => (b.hourlyGain ?? -1) - (a.hourlyGain ?? -1));
  }
  async start() {
    if (!this.configured())
      throw new AppError(
        "YOUTUBE_KEY",
        "상승 영상 탐색에는 YouTube API 키가 필요합니다.",
      );
    if (this.running) return;
    this.running = true;
    this.emit();
    await this.tick(true);
    if (this.running)
      this.timer = setInterval(() => void this.tick(), 15 * 60_000);
  }
  stop() {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.emit();
  }
  async tick(forceSearch = false) {
    if (this.pending || !this.running) return;
    this.pending = true;
    try {
      const now = new Date();
      if (
        forceSearch ||
        !this.lastSearchAt ||
        now.getTime() - Date.parse(this.lastSearchAt) >= 3600_000
      ) {
        const videos = await this.source.search();
        if (!this.running) return;
        for (const video of videos)
          this.store.addCandidate(video, now.toISOString());
        this.store.pruneCandidates();
        this.lastSearchAt = now.toISOString();
        this.store.set("lastSearchAt", this.lastSearchAt);
      }
      const counts = await this.source.viewCounts(
        this.store.candidates().map((v) => v.id),
      );
      if (!this.running) return;
      for (const [videoId, views] of counts)
        this.store.addSnapshot({
          videoId,
          views,
          observedAt: new Date().toISOString(),
        });
      this.error = null;
    } catch (error) {
      this.error = safeError(error);
    } finally {
      this.pending = false;
      this.emit();
    }
  }
}

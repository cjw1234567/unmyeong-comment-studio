import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { localPath } from "../src/server/config.js";
import { measureVelocity } from "../src/server/discovery.js";
import type { Video, ViewSnapshot } from "../src/shared/types.js";

// Export existing real measurements only. This command never makes API calls,
// changes observation timestamps, or substitutes fixture data.
const databasePath = localPath("studio.sqlite");
if (!existsSync(databasePath))
  throw Error("먼저 앱에서 실제 관측을 시작하세요.");
const db = new DatabaseSync(databasePath, { readOnly: true });
try {
  const now = new Date();
  const videos = db
    .prepare(
      "SELECT v.data FROM discovery_pool p JOIN videos v ON p.video_id=v.id",
    )
    .all();
  const items = videos.map((row) => {
    const video = JSON.parse(String(row.data)) as Video;
    const snapshots: ViewSnapshot[] = db
      .prepare(
        "SELECT observed_at,views FROM snapshots WHERE video_id=? ORDER BY observed_at",
      )
      .all(video.id)
      .map((s) => ({
        videoId: video.id,
        observedAt: String(s.observed_at),
        views: Number(s.views),
      }));
    const result = measureVelocity(video, snapshots, now);
    return {
      videoId: video.id,
      title: video.title,
      status: result.status,
      views: result.views,
      hourlyGain: result.hourlyGain,
      intervalMinutes: result.intervalMinutes,
      snapshots,
    };
  });
  const compared = items.filter(
    (i) => i.hourlyGain !== null && !["stale", "invalid"].includes(i.status),
  );
  const report = {
    generatedAt: now.toISOString(),
    source: "YouTube Data API 실제 조회수 / 이 설치의 영속 관측 기록",
    totalVideos: items.length,
    comparableVideos: compared.length,
    candidates: items.filter((i) => i.status === "candidate").length,
    note: "후보가 0개여도 측정 실패를 뜻하지 않습니다. 55~65분 사이의 실제 관측을 비교하며 중단 기간을 추정하지 않습니다.",
    items,
  };
  mkdirSync(localPath("artifacts"), { recursive: true });
  const output = localPath("artifacts/observation-report.json");
  writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
  console.log(
    `관측 ${items.length}개 / 비교 가능 ${compared.length}개 / 상승 후보 ${report.candidates}개\n실측 기록: ${output}`,
  );
  if (!compared.length) process.exitCode = 1;
} finally {
  db.close();
}

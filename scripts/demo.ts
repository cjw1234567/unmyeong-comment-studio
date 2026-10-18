import { Store } from "../src/server/store.js";
import { Studio } from "../src/server/service.js";
import { createApp, serveProduction } from "../src/server/app.js";
import {
  fixtureVideos,
  fixtureSource,
  fixtureEvidence,
  fixtureDraft,
  seedFixtures,
  simulatedPoster,
  TEST_ID,
} from "../tests/fixtures.js";
// Memory-only demo. No real browser, real posting, API calls, or production DB writes.
const store = new Store(":memory:");
seedFixtures(store);
const studio = new Studio(store, {
  simulation: true,
  source: fixtureSource,
  poster: simulatedPoster,
  evidenceReader: async (v) => fixtureEvidence(v),
  generator: async (e, p) =>
    fixtureDraft(
      fixtureVideos.find((v) => v.id === e.videoId)!,
      p,
    ),
  testIds: () => [TEST_ID],
  keys: { openai: true, youtube: true },
});
const now = Date.now();
for (const [i, video] of fixtureVideos.slice(1).entries()) {
  store.addCandidate(
    { ...video, scope: "discovery" },
    new Date(now).toISOString(),
  );
  store.addSnapshot({
    videoId: video.id,
    observedAt: new Date(now - 3600_000).toISOString(),
    views: 1650 + i * 100,
  });
  store.addSnapshot({
    videoId: video.id,
    observedAt: new Date(now).toISOString(),
    views: 1880 + i * 130,
  });
}
const app = createApp(studio);
serveProduction(app);
const server = app.listen(Number(process.env.PORT || 4318), "127.0.0.1", () =>
  console.log(
    `화면 체험 · 실제 게시 없음 · http://127.0.0.1:${process.env.PORT || 4318}`,
  ),
);
process.on("SIGTERM", () => {
  studio.discovery.stop();
  server.close();
  store.close();
  process.exit(0);
});

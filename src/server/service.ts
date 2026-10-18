import { readFileSync, existsSync } from "node:fs";
import { EventEmitter } from "node:events";
import { CHANNELS, PROFILES } from "../shared/constants.js";
import type {
  Draft,
  PostingAttempt,
  PreparedBundle,
  SystemState,
  Video,
  VideoEvidence,
} from "../shared/types.js";
import {
  AppError,
  insideRoot,
  profilePrepared,
  safeError,
  testVideoIds,
} from "./config.js";
import {
  ChromePoster,
  BrowserFailure,
  ExistingCommentFailure,
  readVideoEvidence,
  type Poster,
} from "./browser.js";
import { generateDraft, type DraftGenerator } from "./ai.js";
import { Discovery } from "./discovery.js";
import { Store } from "./store.js";
import { YouTubeSource, type VideoSource } from "./youtube.js";

export interface ServiceOptions {
  simulation?: boolean;
  source?: VideoSource;
  poster?: Poster;
  generator?: DraftGenerator;
  evidenceReader?: (video: Video) => Promise<VideoEvidence>;
  testIds?: () => string[];
  keys?: { openai: boolean; youtube: boolean };
}
export class Studio {
  events = new EventEmitter();
  source: VideoSource;
  poster: Poster;
  discovery: Discovery;
  generator: DraftGenerator;
  simulation: boolean;
  verifying = false;
  reader: (v: Video) => Promise<VideoEvidence>;
  testIds: () => string[];
  private jobs = new Set<Promise<unknown>>();
  constructor(
    public store: Store,
    public options: ServiceOptions = {},
  ) {
    this.simulation = options.simulation ?? false;
    this.source = options.source ?? new YouTubeSource();
    this.poster = options.poster ?? new ChromePoster();
    this.generator = options.generator ?? generateDraft;
    this.reader = options.evidenceReader ?? readVideoEvidence;
    this.testIds = options.testIds ?? testVideoIds;
    this.discovery = new Discovery(
      store,
      this.source,
      () => this.emit(),
      () => options.keys?.youtube ?? Boolean(process.env.YOUTUBE_API_KEY),
    );
  }
  emit() {
    this.events.emit("change");
  }
  state(): SystemState {
    return {
      simulation: this.simulation,
      settings: this.store.settings(),
      profiles: PROFILES.map((p) => ({
        ...p,
        prepared: this.simulation || profilePrepared(p.id),
      })),
      nextProfileId: this.store.nextProfile(),
      openaiConfigured:
        this.options.keys?.openai ?? Boolean(process.env.OPENAI_API_KEY),
      youtubeConfigured:
        this.options.keys?.youtube ?? Boolean(process.env.YOUTUBE_API_KEY),
      ...this.store.quota(),
      busy: this.store.busy() || this.verifying,
      discovery: this.discovery.status(),
      testVideoIds: this.testIds(),
    };
  }
  allowed(video: Video) {
    return (
      this.testIds().includes(video.id) ||
      CHANNELS.some((c) => c.id === video.channelId)
    );
  }
  eligible(video: Video) {
    if (video.scope === "discovery" || !this.allowed(video))
      throw new AppError("NOT_ALLOWED", "게시 허용 영상이 아닙니다.");
    if (
      this.store.settings().mode === "test" &&
      !this.testIds().includes(video.id)
    )
      throw new AppError(
        "TEST_ONLY",
        "테스트 모드에서는 등록한 본인 테스트 영상에만 게시할 수 있습니다.",
      );
  }
  importPrepared() {
    const file = insideRoot("drafts/prepared.json");
    if (!existsSync(file)) return;
    const bundle = JSON.parse(readFileSync(file, "utf8")) as PreparedBundle;
    if (bundle.schemaVersion !== 1)
      throw new AppError("BUNDLE", "사전 초안 버전이 올바르지 않습니다.");
    for (const v of bundle.videos)
      if (CHANNELS.some((c) => c.id === v.channelId))
        this.store.upsertVideo({ ...v, scope: "channel" });
    for (const evidence of bundle.evidence)
      if (
        this.store.video(evidence.videoId) &&
        !this.store.evidence(evidence.videoId)
      )
        this.store.saveEvidence(evidence);
    for (const draft of bundle.drafts)
      if (this.store.video(draft.videoId))
        this.store.saveDraft(
          { ...draft, source: "prepared", purpose: "posting" },
          true,
        );
  }
  async refresh() {
    const result = await this.source.latest();
    for (const video of result.videos)
      if (CHANNELS.some((c) => c.id === video.channelId))
        this.store.upsertVideo({ ...video, scope: "channel" });
    // Test videos are never silently added to the channel list unless explicitly registered.
    for (const id of this.testIds()) {
      try {
        const v = await this.source.resolve(id);
        this.store.upsertVideo({ ...v, scope: "test" });
      } catch {
        result.errors.push("등록한 테스트 영상 정보를 불러오지 못했습니다.");
      }
    }
    this.emit();
    return { ...result, videos: this.listVideos() };
  }
  listVideos() {
    const all = this.store.videos();
    return [
      ...CHANNELS.flatMap((c) =>
        all
          .filter((v) => v.channelId === c.id && v.scope === "channel")
          .slice(0, 5),
      ),
      ...all
        .filter((v) => this.testIds().includes(v.id))
        .map((v) => ({ ...v, scope: "test" as const })),
    ]
      .filter((v, i, arr) => arr.findIndex((x) => x.id === v.id) === i)
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  }
  async resolve(id: string) {
    const video = await this.source.resolve(id);
    if (!this.allowed(video))
      throw new AppError(
        "NOT_ALLOWED",
        "허용된 5개 채널 또는 등록한 본인 테스트 영상만 추가할 수 있습니다.",
      );
    video.scope = this.testIds().includes(id) ? "test" : "channel";
    this.store.upsertVideo(video);
    this.emit();
    return video;
  }
  async evidence(id: string, purpose: Draft["purpose"] = "posting") {
    const video = this.store.video(id);
    if (!video) throw new AppError("NOT_FOUND", "영상이 없습니다.", 404);
    if (
      purpose === "posting" &&
      (!this.allowed(video) || video.scope === "discovery")
    )
      throw new AppError("NOT_ALLOWED", "허용 영상이 아닙니다.");
    // Discovery is API-only even if the channel happens to be allowlisted.
    const data =
      purpose === "discovery"
        ? await this.source.publicEvidence(video)
        : await this.reader(video);
    this.store.saveEvidence(data, purpose);
    this.emit();
    return data;
  }
  async generate(id: string, purpose: Draft["purpose"]) {
    const video = this.store.video(id);
    if (!video) throw new AppError("NOT_FOUND", "영상이 없습니다.", 404);
    if (
      purpose === "posting" &&
      (!this.allowed(video) || video.scope === "discovery")
    )
      throw new AppError("NOT_ALLOWED", "허용 영상이 아닙니다.");
    const evidence =
      this.store.evidence(id, purpose) ?? (await this.evidence(id, purpose));
    const draft = await this.generator(
      evidence,
      purpose,
      this.store
        .drafts()
        .filter((d) => d.videoId !== id)
        .map((d) => d.text),
    );
    const saved = this.store.saveDraft(draft);
    this.emit();
    return saved;
  }
  start(input: {
    videoId: string;
    profileId: string;
    draftRevision: number;
    requestKey: string;
  }) {
    if (this.verifying)
      throw new AppError("BUSY", "댓글 결과를 확인 중입니다.", 409);
    const { attempt, created } = this.store.reserve(input, (v) =>
      this.eligible(v),
    );
    if (created) {
      const job = this.run(attempt);
      this.jobs.add(job);
      void job.finally(() => this.jobs.delete(job));
      this.emit();
    }
    return attempt;
  }
  async run(attempt: PostingAttempt) {
    try {
      const fresh = await this.source.resolve(attempt.videoId);
      fresh.scope = this.testIds().includes(fresh.id) ? "test" : "channel";
      this.eligible(fresh);
      this.store.upsertVideo(fresh);
      const result = await this.poster.post(attempt, {
        stage: (status) => {
          this.store.updateAttempt(attempt.id, { status });
          this.emit();
        },
        verifyChannel: (channelId) => {
          if (channelId !== fresh.channelId)
            throw new AppError(
              "CHANNEL_CHANGED",
              "화면의 실제 채널이 사전 확인한 채널과 달라 게시를 중단했습니다.",
            );
        },
        beforeSubmit: () => {
          this.store.markSubmitting(attempt.id, (v) => this.eligible(v));
          this.emit();
        },
      });
      this.store.finish(attempt.id, "succeeded", {
        commentUrl: result.commentUrl,
      });
    } catch (error) {
      const current = this.store.attempt(attempt.id)!;
      this.store.finish(
        attempt.id,
        error instanceof ExistingCommentFailure
          ? "blocked"
          : current.submittedAt
            ? "uncertain"
            : "failed",
        {
          error: safeError(error),
          commentUrl:
            error instanceof ExistingCommentFailure
              ? error.commentUrl
              : undefined,
          screenshot:
            error instanceof BrowserFailure ? error.screenshot : undefined,
        },
      );
    } finally {
      this.emit();
    }
  }
  async verify(id: string) {
    if (this.state().busy)
      throw new AppError("BUSY", "다른 작업이 진행 중입니다.", 409);
    const attempt = this.store.attempt(id);
    if (!attempt || attempt.status !== "uncertain")
      throw new AppError(
        "STATE",
        "확인 필요 상태의 실행만 다시 확인할 수 있습니다.",
      );
    const video = this.store.video(attempt.videoId);
    if (!video || !this.allowed(video))
      throw new AppError("NOT_ALLOWED", "허용 영상이 아닙니다.");
    this.verifying = true;
    this.emit();
    try {
      const result = await this.poster.verify(attempt);
      this.store.finish(id, "succeeded", {
        commentUrl: result.commentUrl,
        error: undefined,
      });
    } catch (error) {
      this.store.updateAttempt(id, {
        error: safeError(error),
        screenshot:
          error instanceof BrowserFailure
            ? error.screenshot
            : attempt.screenshot,
      });
    } finally {
      this.verifying = false;
      this.emit();
    }
    return this.store.attempt(id);
  }
  async idle() {
    await Promise.allSettled([...this.jobs]);
  }
  async close() {
    this.discovery.stop();
    await this.idle();
  }
}

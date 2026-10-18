import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import type {
  Draft,
  PostingAttempt,
  Settings,
  Video,
  VideoEvidence,
  ViewSnapshot,
} from "../shared/types.js";
import { STAGES, PROFILES } from "../shared/constants.js";
import {
  seoulDate,
  validateEvidence,
  validateText,
} from "../shared/validation.js";
import { AppError } from "./config.js";

const ACTIVE = [
  "reserved",
  "opening",
  "loading",
  "typing",
  "submitting",
  "verifying",
];
export class Store {
  db: DatabaseSync;
  constructor(file: string) {
    this.db = new DatabaseSync(file);
    this.db
      .exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS videos (id TEXT PRIMARY KEY, scope TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS evidence (video_id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS drafts (id TEXT PRIMARY KEY, video_id TEXT NOT NULL, purpose TEXT NOT NULL, data TEXT NOT NULL, UNIQUE(video_id,purpose));
      CREATE TABLE IF NOT EXISTS attempts (id TEXT PRIMARY KEY, request_key TEXT UNIQUE NOT NULL, video_id TEXT NOT NULL, status TEXT NOT NULL, quota_date TEXT NOT NULL, data TEXT NOT NULL);
      CREATE UNIQUE INDEX IF NOT EXISTS one_video ON attempts(video_id) WHERE status != 'failed';
      CREATE UNIQUE INDEX IF NOT EXISTS one_active ON attempts((1)) WHERE status IN ('reserved','opening','loading','typing','submitting','verifying');
      CREATE TABLE IF NOT EXISTS snapshots (video_id TEXT NOT NULL, observed_at TEXT NOT NULL, views INTEGER NOT NULL, PRIMARY KEY(video_id, observed_at));
      CREATE INDEX IF NOT EXISTS snapshot_video ON snapshots(video_id,observed_at);
      CREATE TABLE IF NOT EXISTS discovery_pool (video_id TEXT PRIMARY KEY, found_at TEXT NOT NULL);
      PRAGMA user_version=1;`);
  }
  close() {
    this.db.close();
  }
  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const value = fn();
      this.db.exec("COMMIT");
      return value;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  get<T>(key: string, fallback: T): T {
    const row = this.db.prepare("SELECT value FROM kv WHERE key=?").get(key);
    return row ? JSON.parse(row.value as string) : fallback;
  }
  set(key: string, value: unknown) {
    this.db
      .prepare("INSERT OR REPLACE INTO kv VALUES (?,?)")
      .run(key, JSON.stringify(value));
  }
  settings(): Settings {
    return this.get("settings", {
      mode: "test",
      dailyLimit: 10,
      rotation: false,
      selectedProfileId: "youtube1",
    });
  }
  saveSettings(settings: Settings) {
    if (this.busy())
      throw new AppError("BUSY", "게시 중에는 설정을 바꿀 수 없습니다.", 409);
    this.set("settings", settings);
  }
  nextProfile(): string {
    const settings = this.settings();
    return settings.rotation
      ? PROFILES[this.get("rotationIndex", 0) % PROFILES.length].id
      : settings.selectedProfileId;
  }
  upsertVideo(video: Video) {
    const old = this.video(video.id);
    const next =
      old && old.scope !== "discovery" && video.scope === "discovery"
        ? { ...video, scope: old.scope }
        : video;
    this.db
      .prepare("INSERT OR REPLACE INTO videos VALUES (?,?,?)")
      .run(next.id, next.scope, JSON.stringify(next));
  }
  video(id: string): Video | undefined {
    const row = this.db.prepare("SELECT data FROM videos WHERE id=?").get(id);
    return row ? JSON.parse(row.data as string) : undefined;
  }
  videos(): Video[] {
    return this.db
      .prepare("SELECT data FROM videos WHERE scope != 'discovery'")
      .all()
      .map((r) => JSON.parse(r.data as string) as Video)
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  }
  saveEvidence(evidence: VideoEvidence, purpose: Draft["purpose"] = "posting") {
    if (
      this.attempts().some(
        (a) => ACTIVE.includes(a.status) && a.videoId === evidence.videoId,
      )
    )
      throw new AppError(
        "BUSY",
        "게시 중인 영상의 근거는 변경할 수 없습니다.",
        409,
      );
    this.db
      .prepare("INSERT OR REPLACE INTO evidence VALUES (?,?)")
      .run(
        purpose === "posting"
          ? evidence.videoId
          : `discovery:${evidence.videoId}`,
        JSON.stringify(evidence),
      );
  }
  evidence(
    id: string,
    purpose: Draft["purpose"] = "posting",
  ): VideoEvidence | undefined {
    const r = this.db
      .prepare("SELECT data FROM evidence WHERE video_id=?")
      .get(purpose === "posting" ? id : `discovery:${id}`);
    return r ? JSON.parse(r.data as string) : undefined;
  }
  draft(
    videoId: string,
    purpose: Draft["purpose"] = "posting",
  ): Draft | undefined {
    const r = this.db
      .prepare("SELECT data FROM drafts WHERE video_id=? AND purpose=?")
      .get(videoId, purpose);
    return r ? JSON.parse(r.data as string) : undefined;
  }
  drafts(): Draft[] {
    return this.db
      .prepare("SELECT data FROM drafts")
      .all()
      .map((r) => JSON.parse(r.data as string));
  }
  saveDraft(draft: Draft, preserveExisting = false): Draft {
    const current = this.draft(draft.videoId, draft.purpose);
    if (preserveExisting && current) return current;
    if (
      this.attempts().some(
        (a) => ACTIVE.includes(a.status) && a.videoId === draft.videoId,
      )
    )
      throw new AppError(
        "BUSY",
        "게시 중인 영상의 초안은 변경할 수 없습니다.",
        409,
      );
    const result = {
      ...draft,
      id: current?.id ?? draft.id,
      revision: (current?.revision ?? 0) + 1,
    };
    result.validationErrors = [
      ...validateText(
        result.text,
        this.drafts()
          .filter((d) => d.videoId !== result.videoId)
          .map((d) => d.text),
      ),
      ...validateEvidence(
        result,
        this.evidence(result.videoId, result.purpose),
      ),
    ];
    this.db
      .prepare("INSERT OR REPLACE INTO drafts VALUES (?,?,?,?)")
      .run(result.id, result.videoId, result.purpose, JSON.stringify(result));
    return result;
  }
  attempts(): PostingAttempt[] {
    return this.db
      .prepare("SELECT data FROM attempts ORDER BY rowid DESC")
      .all()
      .map((r) => JSON.parse(r.data as string));
  }
  attempt(id: string): PostingAttempt | undefined {
    const r = this.db.prepare("SELECT data FROM attempts WHERE id=?").get(id);
    return r ? JSON.parse(r.data as string) : undefined;
  }
  busy() {
    return this.attempts().some((a) => ACTIVE.includes(a.status));
  }
  quota(now: Date = new Date(), excludeId?: string) {
    const all = this.attempts().filter((a) => a.id !== excludeId);
    const todaySuccess = all.filter(
      (a) => a.status === "succeeded" && a.quotaDate === seoulDate(now),
    ).length;
    const occupiedSlots =
      todaySuccess +
      all.filter((a) => ACTIVE.includes(a.status) || a.status === "uncertain")
        .length;
    return { todaySuccess, occupiedSlots };
  }
  reserve(
    input: {
      videoId: string;
      profileId: string;
      draftRevision: number;
      requestKey: string;
    },
    eligible: (video: Video) => void,
    now = new Date(),
  ) {
    return this.transaction(() => {
      const prior = this.db
        .prepare("SELECT data FROM attempts WHERE request_key=?")
        .get(input.requestKey);
      if (prior) {
        const a = JSON.parse(prior.data as string) as PostingAttempt;
        if (
          a.videoId !== input.videoId ||
          a.profileId !== input.profileId ||
          a.draftRevision !== input.draftRevision
        )
          throw new AppError(
            "KEY_REUSED",
            "다른 작업에 사용한 요청 키입니다.",
            409,
          );
        return { attempt: a, created: false };
      }
      if (this.busy())
        throw new AppError("BUSY", "현재 게시 작업이 진행 중입니다.", 409);
      const video = this.video(input.videoId);
      if (!video)
        throw new AppError("VIDEO_MISSING", "먼저 영상을 불러와 주세요.");
      eligible(video);
      if (
        this.attempts().some(
          (a) => a.videoId === video.id && a.status !== "failed",
        )
      )
        throw new AppError(
          "DUPLICATE",
          "이미 게시했거나 결과 확인이 필요한 영상입니다.",
          409,
        );
      if (!PROFILES.some((p) => p.id === input.profileId))
        throw new AppError("PROFILE", "알 수 없는 프로필입니다.");
      if (input.profileId !== this.nextProfile())
        throw new AppError(
          "PROFILE_CHANGED",
          "선택된 프로필이 변경되었습니다. 화면을 갱신해 주세요.",
          409,
        );
      const draft = this.draft(input.videoId);
      if (!draft || draft.revision !== input.draftRevision)
        throw new AppError(
          "DRAFT_CHANGED",
          "초안이 변경되었습니다. 최신 초안을 확인해 주세요.",
          409,
        );
      const errors = [
        ...validateText(
          draft.text,
          this.drafts()
            .filter((d) => d.videoId !== draft.videoId)
            .map((d) => d.text),
        ),
        ...validateEvidence(draft, this.evidence(video.id)),
      ];
      if (errors.length || !draft.reviewed)
        throw new AppError(
          "DRAFT_INVALID",
          errors[0] ||
            "영상 근거와 초안을 검토한 뒤 검토 완료를 선택해 주세요.",
        );
      if (this.quota(now).occupiedSlots >= this.settings().dailyLimit)
        throw new AppError(
          "LIMIT",
          "오늘 게시 상한에 도달했습니다. 확인 필요 건도 상한에 포함됩니다.",
          409,
        );
      const attempt: PostingAttempt = {
        id: randomUUID(),
        requestKey: input.requestKey,
        videoId: video.id,
        videoTitle: video.title,
        profileId: input.profileId,
        draftId: draft.id,
        draftRevision: draft.revision,
        text: draft.text,
        status: "reserved",
        stage: STAGES.reserved,
        startedAt: now.toISOString(),
        quotaDate: seoulDate(now),
      };
      this.db
        .prepare("INSERT INTO attempts VALUES (?,?,?,?,?,?)")
        .run(
          attempt.id,
          attempt.requestKey,
          attempt.videoId,
          attempt.status,
          attempt.quotaDate,
          JSON.stringify(attempt),
        );
      return { attempt, created: true };
    });
  }
  updateAttempt(id: string, patch: Partial<PostingAttempt>) {
    const current = this.attempt(id);
    if (!current) throw new AppError("NOT_FOUND", "실행 기록이 없습니다.", 404);
    const value = { ...current, ...patch };
    if (patch.status) value.stage = STAGES[patch.status];
    this.db
      .prepare("UPDATE attempts SET status=?,quota_date=?,data=? WHERE id=?")
      .run(value.status, value.quotaDate, JSON.stringify(value), id);
    return value;
  }
  markSubmitting(
    id: string,
    eligible: (video: Video) => void,
    now = new Date(),
  ) {
    return this.transaction(() => {
      const a = this.attempt(id)!;
      const v = this.video(a.videoId)!;
      eligible(v);
      const draft = this.draft(a.videoId);
      if (
        !draft ||
        draft.id !== a.draftId ||
        draft.revision !== a.draftRevision ||
        draft.text !== a.text ||
        !draft.reviewed ||
        validateText(
          draft.text,
          this.drafts()
            .filter((d) => d.videoId !== a.videoId)
            .map((d) => d.text),
        ).length ||
        validateEvidence(draft, this.evidence(a.videoId)).length
      )
        throw new AppError(
          "DRAFT_CHANGED",
          "게시 직전 초안 검증에 실패했습니다.",
        );
      if (a.submittedAt)
        throw new AppError(
          "ALREADY_SUBMITTED",
          "이미 게시를 시도한 실행입니다. 결과 확인만 가능합니다.",
        );
      if (this.quota(now, id).occupiedSlots >= this.settings().dailyLimit)
        throw new AppError("LIMIT", "게시 직전 일일 상한을 초과했습니다.");
      return this.updateAttempt(id, {
        status: "submitting",
        quotaDate: seoulDate(now),
        submittedAt: now.toISOString(),
      });
    });
  }
  finish(
    id: string,
    status: "succeeded" | "failed" | "uncertain" | "blocked",
    patch: Partial<PostingAttempt> = {},
  ) {
    return this.transaction(() => {
      const previous = this.attempt(id)!;
      const result = this.updateAttempt(id, {
        failureStage:
          status === "succeeded"
            ? undefined
            : (previous.failureStage ?? previous.stage),
        ...patch,
        status,
        finishedAt: new Date().toISOString(),
      });
      if (
        status === "succeeded" &&
        previous.status !== "succeeded" &&
        this.settings().rotation
      )
        this.set("rotationIndex", this.get("rotationIndex", 0) + 1);
      return result;
    });
  }
  recoverInterrupted() {
    for (const a of this.attempts().filter((a) => ACTIVE.includes(a.status)))
      this.finish(a.id, a.submittedAt ? "uncertain" : "failed", {
        error: a.submittedAt
          ? "프로그램이 종료되어 게시 결과를 확인하지 못했습니다. 재게시하지 말고 결과를 확인해 주세요."
          : "게시 전 프로그램이 종료되었습니다. 다시 시도할 수 있습니다.",
      });
  }
  addCandidate(video: Video, now: string) {
    this.upsertVideo(video);
    this.db
      .prepare("INSERT OR REPLACE INTO discovery_pool VALUES (?,?)")
      .run(video.id, now);
  }
  pruneCandidates() {
    this.transaction(() => {
      this.db.exec(
        "DELETE FROM discovery_pool WHERE video_id NOT IN (SELECT video_id FROM discovery_pool ORDER BY found_at DESC,video_id LIMIT 200)",
      );
      const removed = this.db
        .prepare(
          "SELECT id FROM videos WHERE scope='discovery' AND id NOT IN (SELECT video_id FROM discovery_pool) AND id NOT IN (SELECT video_id FROM attempts)",
        )
        .all();
      for (const { id } of removed) {
        this.db.prepare("DELETE FROM snapshots WHERE video_id=?").run(id);
        this.db
          .prepare(
            "DELETE FROM drafts WHERE video_id=? AND purpose='discovery'",
          )
          .run(id);
        this.db
          .prepare("DELETE FROM evidence WHERE video_id=?")
          .run(`discovery:${id}`);
        this.db.prepare("DELETE FROM videos WHERE id=?").run(id);
      }
    });
  }
  candidates(): Video[] {
    return this.db
      .prepare(
        "SELECT v.data FROM discovery_pool p JOIN videos v ON p.video_id=v.id ORDER BY p.found_at DESC",
      )
      .all()
      .map((r) => JSON.parse(r.data as string));
  }
  addSnapshot(snapshot: ViewSnapshot) {
    this.db
      .prepare("INSERT OR REPLACE INTO snapshots VALUES (?,?,?)")
      .run(snapshot.videoId, snapshot.observedAt, snapshot.views);
    this.db
      .prepare(
        "DELETE FROM snapshots WHERE video_id=? AND observed_at NOT IN (SELECT observed_at FROM snapshots WHERE video_id=? ORDER BY observed_at DESC LIMIT 200)",
      )
      .run(snapshot.videoId, snapshot.videoId);
  }
  snapshots(id: string): ViewSnapshot[] {
    return this.db
      .prepare(
        "SELECT video_id,observed_at,views FROM snapshots WHERE video_id=? ORDER BY observed_at DESC LIMIT 200",
      )
      .all(id)
      .map((r) => ({
        videoId: r.video_id as string,
        observedAt: r.observed_at as string,
        views: r.views as number,
      }));
  }
}

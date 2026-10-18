export interface Video {
  id: string;
  channelId: string;
  channelName: string;
  title: string;
  description: string;
  thumbnail: string;
  publishedAt: string;
  fetchedAt: string;
  scope: "channel" | "test" | "discovery";
}
export interface VideoEvidence {
  videoId: string;
  fetchedAt: string;
  title: string;
  description: string;
  transcript: { text: string; timestamp?: string }[];
  comments: string[];
  transcriptStatus: "available" | "unavailable" | "not_requested";
  commentsStatus: "available" | "empty" | "unavailable";
  notes: string[];
}
export interface EvidenceReference {
  source: "title" | "description" | "transcript";
  quote: string;
  timestamp?: string;
}
export interface Draft {
  id: string;
  videoId: string;
  revision: number;
  summary: string;
  text: string;
  evidence: EvidenceReference[];
  source: "prepared" | "generated" | "edited";
  purpose: "posting" | "discovery";
  createdAt: string;
  reviewed: boolean;
  validationErrors: string[];
  model?: string;
  promptVersion?: string;
}
export interface ProfileConfig {
  id: string;
  name: string;
  prepared: boolean;
}
export type AttemptStatus =
  | "reserved"
  | "opening"
  | "loading"
  | "typing"
  | "submitting"
  | "verifying"
  | "succeeded"
  | "failed"
  | "uncertain"
  | "blocked";
export interface PostingAttempt {
  id: string;
  requestKey: string;
  videoId: string;
  videoTitle: string;
  profileId: string;
  draftId: string;
  draftRevision: number;
  text: string;
  status: AttemptStatus;
  stage: string;
  startedAt: string;
  finishedAt?: string;
  quotaDate: string;
  error?: string;
  failureStage?: string;
  screenshot?: string;
  commentUrl?: string;
  submittedAt?: string;
}
export interface ViewSnapshot {
  videoId: string;
  observedAt: string;
  views: number;
}
export interface DiscoveryResult {
  video: Video;
  views: number | null;
  hourlyGain: number | null;
  intervalMinutes: number | null;
  status: "candidate" | "watching" | "waiting" | "stale" | "invalid";
  lastObservedAt?: string;
}
export interface Settings {
  mode: "test" | "review";
  dailyLimit: number;
  rotation: boolean;
  selectedProfileId: string;
}
export interface SystemState {
  simulation: boolean;
  settings: Settings;
  profiles: ProfileConfig[];
  nextProfileId: string;
  openaiConfigured: boolean;
  youtubeConfigured: boolean;
  todaySuccess: number;
  occupiedSlots: number;
  busy: boolean;
  discovery: {
    running: boolean;
    lastSearchAt: string | null;
    error: string | null;
  };
  testVideoIds: string[];
}
export interface PreparedBundle {
  schemaVersion: 1;
  collectedAt: string;
  videos: Video[];
  evidence: VideoEvidence[];
  drafts: Draft[];
}

import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  lstatSync,
} from "node:fs";
import path from "node:path";
import { config as dotenv } from "dotenv";
import { PROFILES, VIDEO_ID } from "../shared/constants.js";
export const ROOT = realpathSync(process.cwd());
dotenv({ path: path.join(ROOT, ".env"), quiet: true });
export function insideRoot(relative: string): string {
  const result = path.resolve(ROOT, relative);
  if (result !== ROOT && !result.startsWith(ROOT + path.sep))
    throw new Error("프로젝트 외부 경로는 사용할 수 없습니다.");
  let ancestor = result;
  while (!existsSync(ancestor)) ancestor = path.dirname(ancestor);
  const actual = realpathSync(ancestor);
  if (actual !== ROOT && !actual.startsWith(ROOT + path.sep))
    throw new Error("프로젝트 외부 심볼릭 링크는 사용할 수 없습니다.");
  return result;
}
const dataName = process.env.APP_DATA_DIR || ".local";
if (!/^\.local(?:-[a-zA-Z0-9-]+)?$/.test(dataName))
  throw new Error(
    "APP_DATA_DIR은 프로젝트 내부 .local 또는 .local-* 폴더여야 합니다.",
  );
export const DATA_DIR = insideRoot(dataName);
export function ensureDataDir() {
  mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
}
export function localPath(relative: string) {
  return insideRoot(path.relative(ROOT, path.resolve(DATA_DIR, relative)));
}
// Optional recording dependency is kept inside this installation.
process.env.PLAYWRIGHT_BROWSERS_PATH = localPath("playwright");
export function testVideoIds(): string[] {
  const file = localPath("test-videos.json");
  if (!existsSync(file)) return [];
  const data: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (
    !Array.isArray(data) ||
    !data.every((id) => typeof id === "string" && VIDEO_ID.test(id))
  )
    throw new Error("테스트 영상 설정 형식이 올바르지 않습니다.");
  return [...new Set(data)];
}
export function profilePath(id: string) {
  if (!PROFILES.some((p) => p.id === id))
    throw new Error("알 수 없는 프로필입니다.");
  return localPath(`profiles/${id}`);
}
export function profilePrepared(id: string) {
  const p = profilePath(id);
  return existsSync(p) && lstatSync(p).isDirectory();
}
export const MODEL = process.env.OPENAI_MODEL || "gpt-5.4-mini-2026-03-17";
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function safeError(error: unknown): string {
  let text =
    error instanceof AppError
      ? error.message
      : "작업을 완료하지 못했습니다. 연결 상태와 설정을 확인해 주세요.";
  for (const secret of [
    process.env.OPENAI_API_KEY,
    process.env.YOUTUBE_API_KEY,
  ])
    if (secret) text = text.replaceAll(secret, "[비밀값 제거]");
  return text;
}

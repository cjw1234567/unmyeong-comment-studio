import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readlink: vi.fn(),
  read: vi.fn(),
  exists: vi.fn(),
  unlink: vi.fn(),
  inspect: vi.fn(),
}));
vi.mock("node:fs", () => ({
  readlinkSync: mocks.readlink,
  readFileSync: mocks.read,
  existsSync: mocks.exists,
  unlinkSync: mocks.unlink,
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));
vi.mock("node:child_process", async () => {
  const { promisify } = await import("node:util");
  const execFile = Object.assign(vi.fn(), {
    [promisify.custom]: mocks.inspect,
  });
  return { execFile, spawn: vi.fn() };
});
vi.mock("../src/server/config.js", () => ({
  AppError: class extends Error {
    constructor(_code: string, message: string) {
      super(message);
    }
  },
  profilePath: (id: string) => `/project/.local/profiles/${id}`,
  localPath: (file: string) => `/project/.local/${file}`,
  testVideoIds: () => [],
}));
import { closeManualProfile } from "../src/server/profiles.js";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readlink.mockReturnValue("MacBook-1234");
  mocks.read.mockReturnValue('{"pid":9999}');
  mocks.exists.mockReturnValue(true);
  mocks.inspect.mockResolvedValue({
    stdout:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --user-data-dir=/project/.local/profiles/youtube1 --profile-directory=Default",
  });
});
afterEach(() => vi.restoreAllMocks());

describe("전용 로그인 프로필 종료", () => {
  for (const hasRecord of [true, false]) {
    it(`실제 잠금 PID를 종료한다 (이전 실행 기록 ${hasRecord ? "있음" : "없음"})`, async () => {
      mocks.exists.mockReturnValue(hasRecord);
      const kill = vi
        .spyOn(process, "kill")
        .mockImplementation((_pid, signal) => {
          if (signal === 0)
            throw Object.assign(new Error("종료됨"), { code: "ESRCH" });
          return true;
        });
      await closeManualProfile("youtube1");
      expect(mocks.inspect).toHaveBeenCalledWith("/bin/ps", [
        "-p",
        "1234",
        "-o",
        "command=",
      ]);
      expect(kill).toHaveBeenCalledWith(1234, "SIGTERM");
      expect(kill).not.toHaveBeenCalledWith(9999, "SIGTERM");
    });
  }
  it("다른 전용 프로필의 프로세스를 종료하지 않는다", async () => {
    mocks.inspect.mockResolvedValue({
      stdout:
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --user-data-dir=/project/.local/profiles/youtube2 --profile-directory=Default",
    });
    const kill = vi.spyOn(process, "kill").mockReturnValue(true);
    await expect(closeManualProfile("youtube1")).rejects.toThrow(
      /전용 프로필 프로세스/,
    );
    expect(kill).not.toHaveBeenCalled();
  });
  it("재사용된 PID가 Chrome이 아니면 종료하지 않는다", async () => {
    mocks.inspect.mockResolvedValue({
      stdout:
        "/usr/bin/editor --user-data-dir=/project/.local/profiles/youtube1 --other",
    });
    const kill = vi.spyOn(process, "kill").mockReturnValue(true);
    await expect(closeManualProfile("youtube1")).rejects.toThrow(
      /전용 프로필 프로세스/,
    );
    expect(kill).not.toHaveBeenCalled();
  });
});

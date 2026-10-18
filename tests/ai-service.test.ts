import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
const mock = vi.hoisted(() => ({ parse: vi.fn() }));
vi.mock("openai", () => ({
  default: class {
    responses = { parse: mock.parse };
  },
}));
import { generateDraft } from "../src/server/ai.js";
import { fixtureVideos, fixtureEvidence, fixtureDraft } from "./fixtures.js";
const evidence = fixtureEvidence(fixtureVideos[0]);
const d = fixtureDraft(fixtureVideos[0]);
const valid = {
  summary: d.summary,
  text: d.text,
  evidence: d.evidence.map((e) => ({ ...e, timestamp: null })),
  insufficient: false,
  reason: "",
};
beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "test-key-only");
  mock.parse.mockReset();
});
afterEach(() => vi.unstubAllEnvs());
describe("AI 응답 수명주기", () => {
  it("완료한 구조화 출력만 검토 전 초안으로 반환한다", async () => {
    mock.parse.mockResolvedValue({ status: "completed", output_parsed: valid });
    const draft = await generateDraft(evidence, "posting", []);
    expect(draft.validationErrors).toEqual([]);
    expect(draft.reviewed).toBe(false);
    expect(mock.parse.mock.calls[0][0].store).toBe(false);
  });
  it("형식 오류를 한 번 수정하고 최대 두 번만 요청한다", async () => {
    mock.parse.mockResolvedValue({
      status: "completed",
      output_parsed: { ...valid, text: "짧은 운명원" },
    });
    await expect(generateDraft(evidence, "posting", [])).rejects.toThrow(
      /검증/,
    );
    expect(mock.parse).toHaveBeenCalledTimes(2);
  });
  it("근거 부족 응답은 수정 생성 없이 중단한다", async () => {
    mock.parse.mockResolvedValue({
      status: "completed",
      output_parsed: { ...valid, insufficient: true },
    });
    await expect(generateDraft(evidence, "posting", [])).rejects.toThrow(
      /자료/,
    );
    expect(mock.parse).toHaveBeenCalledTimes(1);
  });
  for (const status of ["incomplete", "refusal"])
    it(`${status} 출력을 저장 가능한 초안으로 반환하지 않는다`, async () => {
      mock.parse.mockResolvedValue({
        status: status === "refusal" ? "completed" : status,
        output_parsed: null,
      });
      await expect(generateDraft(evidence, "posting", [])).rejects.toThrow(
        /완전한 초안/,
      );
      expect(mock.parse).toHaveBeenCalledTimes(1);
    });
  it("시간 초과 원문이나 키를 오류 메시지로 노출하지 않는다", async () => {
    mock.parse.mockRejectedValue(Error("timeout test-key-only"));
    await expect(generateDraft(evidence, "posting", [])).rejects.toThrow(
      "AI 생성에 실패했습니다.",
    );
    expect(mock.parse).toHaveBeenCalledTimes(1);
  });
});

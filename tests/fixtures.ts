import { randomUUID } from "node:crypto";
import { CHANNELS, watchUrl } from "../src/shared/constants.js";
import type { Draft, Video, VideoEvidence } from "../src/shared/types.js";
import type { VideoSource } from "../src/server/youtube.js";
import type { Store } from "../src/server/store.js";
import type { Poster } from "../src/server/browser.js";
export const TEST_ID = "demoTest001";
const items = [
  [
    "연락의 횟수보다 중요한 건, 대화의 온도",
    "연락의 횟수보다 대화의 온도가 중요하다는 말에 공감해요. 나와 편하게 대화할 인연은 어떤 사람일지 운명원 연애 사주도 궁금해지네요.",
    "연락이 뜸해진 상대의 마음을 어떻게 이해할 수 있을까?",
  ],
  [
    "좋아하는 사람 앞에서 자꾸 작아지는 이유",
    "좋아하는 사람 앞에서 작아지는 마음을 먼저 알아차리라는 말이 남네요. 내 모습 그대로 편한 인연은 어떨지 운명원 연애 사주도 궁금해요.",
    "상대에게 맞추다가 자신을 잃는 연애에서 벗어나려면?",
  ],
  [
    "헤어진 뒤 연락, 정말 다시 시작하고 싶은 걸까?",
    "다시 시작하고 싶은 건지 외로운 건지 구분해 보라는 이야기가 와닿아요. 나와 맞는 인연의 방향은 어떤지 운명원 연애 사주도 한번 알아보고 싶네요.",
    "재회하고 싶은 마음과 익숙함에 대한 그리움을 어떻게 구분할까?",
  ],
  [
    "연애에서 나만 노력하는 것 같을 때",
    "나만 노력하는 관계에서 한 걸음 멈춰 보라는 말이 기억에 남아요. 서로 자연스럽게 마음을 주고받을 인연은 어떨지 운명원 연애 사주가 궁금해지네요.",
    "일방적인 노력에서 벗어나 관계의 균형을 찾으려면?",
  ],
  [
    "오래가는 커플이 갈등을 푸는 방법",
    "갈등을 이기는 대신 함께 풀어가자는 말이 인상적이네요. 나와 이런 대화를 나눌 사람은 어떤 성향일지 운명원 연애 사주도 궁금해요.",
    "다툼 속에서도 서로의 마음을 지키는 대화는 무엇일까?",
  ],
  [
    "새로운 인연 앞에서 망설이게 되는 이유",
    "새로운 인연 앞에서 지난 경험과 지금을 나눠 보라는 말이 좋네요. 내 마음이 편안해질 만남은 어떨지 운명원 연애 사주를 알아보고 싶어져요.",
    "지난 연애의 상처가 새로운 시작을 막을 때 어떻게 해야 할까?",
  ],
];
export const fixtureVideos: Video[] = items.map((item, i) => ({
  id: i === 0 ? TEST_ID : `demoVid000${i}`,
  channelId: i === 0 ? "UC0000000000000000000000" : CHANNELS[i - 1].id,
  channelName: i === 0 ? "내 테스트 채널" : CHANNELS[i - 1].name,
  title: item[0],
  description: item[0],
  thumbnail: "",
  publishedAt: new Date(Date.now() - i * 86400_000).toISOString(),
  fetchedAt: new Date().toISOString(),
  scope: i === 0 ? "test" : "channel",
}));
export function fixtureEvidence(v: Video): VideoEvidence {
  return {
    videoId: v.id,
    title: v.title,
    description: v.description,
    transcript: [{ text: v.title, timestamp: "00:42" }],
    comments: ["상대보다 내 마음을 먼저 돌아보게 되네요."],
    transcriptStatus: "available",
    commentsStatus: "available",
    fetchedAt: new Date().toISOString(),
    notes: ["화면 체험용 가상 자료입니다. 실제 영상 내용이 아닙니다."],
  };
}
export function fixtureDraft(
  v: Video,
  purpose: Draft["purpose"] = "posting",
): Draft {
  const i = fixtureVideos.findIndex((x) => x.id === v.id);
  return {
    id: randomUUID(),
    videoId: v.id,
    revision: 0,
    summary: items[i < 0 ? 0 : i][2],
    text: items[i < 0 ? 0 : i][1],
    evidence: [{ source: "title", quote: v.title }],
    source: "prepared",
    purpose,
    createdAt: new Date().toISOString(),
    reviewed: true,
    validationErrors: [],
  };
}
export function seedFixtures(store: Store) {
  for (const v of fixtureVideos) {
    store.upsertVideo(v);
    store.saveEvidence(fixtureEvidence(v));
    store.saveDraft(fixtureDraft(v), true);
  }
}
export const fixtureSource: VideoSource = {
  async latest() {
    return {
      videos: fixtureVideos.filter((v) => v.scope === "channel"),
      errors: [],
    };
  },
  async resolve(id) {
    const v = fixtureVideos.find((v) => v.id === id);
    if (!v) throw Error("fixture not found");
    return { ...v };
  },
  async publicEvidence(v) {
    return fixtureEvidence(v);
  },
  async search() {
    return fixtureVideos
      .slice(1)
      .map((v) => ({ ...v, scope: "discovery" as const }));
  },
  async viewCounts(ids) {
    return new Map(ids.map((id, i) => [id, 1800 + i * 260]));
  },
};
export const simulatedPoster: Poster = {
  async post(a, cb) {
    const pause = () => new Promise((r) => setTimeout(r, 250));
    cb.stage("opening");
    await pause();
    cb.verifyChannel(fixtureVideos.find((v) => v.id === a.videoId)!.channelId);
    cb.stage("typing");
    await pause();
    cb.beforeSubmit();
    await pause();
    cb.stage("verifying");
    await pause();
    return { commentUrl: watchUrl(a.videoId) };
  },
  async verify(a) {
    return { commentUrl: watchUrl(a.videoId) };
  },
};

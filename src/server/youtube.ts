import { XMLParser } from "fast-xml-parser";
import { CHANNELS } from "../shared/constants.js";
import type { Video, VideoEvidence } from "../shared/types.js";
import { AppError, safeError, testVideoIds } from "./config.js";

export interface VideoSource {
  latest(): Promise<{ videos: Video[]; errors: string[] }>;
  resolve(id: string): Promise<Video>;
  publicEvidence(video: Video): Promise<VideoEvidence>;
  search(): Promise<Video[]>;
  viewCounts(ids: string[]): Promise<Map<string, number>>;
}
async function request(url: string, api = false): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(20_000),
      redirect: "error",
      headers: api
        ? { "X-Goog-Api-Key": process.env.YOUTUBE_API_KEY || "" }
        : { "Accept-Language": "ko-KR,ko;q=0.9", "User-Agent": "Mozilla/5.0" },
    });
  } catch {
    throw new AppError(
      "YOUTUBE_NETWORK",
      "유튜브 연결에 실패했습니다. 네트워크 상태를 확인해 주세요.",
      502,
    );
  }
  if (!response.ok)
    throw new AppError(
      "YOUTUBE_HTTP",
      response.status === 403
        ? "YouTube API 권한·할당량 또는 접근 제한을 확인해 주세요."
        : `유튜브 자료 요청에 실패했습니다. (HTTP ${response.status})`,
      502,
    );
  return response;
}
export function extractJsonAssignment(html: string, name: string): unknown {
  const marker = new RegExp(`(?:var\\s+)?${name}\\s*=\\s*`);
  const match = marker.exec(html);
  if (!match)
    throw new AppError(
      "VIDEO_DATA",
      "영상 정보를 확인할 수 없습니다. 접근 제한 또는 유튜브 화면 변경이 발생했을 수 있습니다.",
      502,
    );
  const start = html.indexOf("{", match.index + match[0].length);
  let depth = 0,
    quoted = false,
    escaped = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0)
      return JSON.parse(html.slice(start, i + 1));
  }
  throw new AppError("VIDEO_DATA", "영상 자료를 해석할 수 없습니다.", 502);
}
export function classifyVideo(id: string, channelId: string): Video["scope"] {
  return testVideoIds().includes(id)
    ? "test"
    : CHANNELS.some((c) => c.id === channelId)
      ? "channel"
      : "discovery";
}
function validVideo(video: Video): Video {
  if (
    !/^[\w-]{11}$/.test(video.id) ||
    !/^UC[\w-]{22}$/.test(video.channelId) ||
    !video.title
  )
    throw new AppError(
      "VIDEO_DATA",
      "영상과 채널의 실제 식별 정보를 확인하지 못했습니다.",
      502,
    );
  return video;
}
export function parseFeed(
  xml: string,
  channel: { id: string; name: string },
  now = new Date(),
): Video[] {
  if (/<!DOCTYPE/i.test(xml))
    throw new AppError(
      "FEED_INVALID",
      "외부 엔티티 선언은 허용하지 않습니다.",
      502,
    );
  const data = new XMLParser({
    ignoreAttributes: false,
    processEntities: true,
  }).parse(xml);
  // YouTube's feed-level ID may omit UC; entry-level channel IDs retain it.
  const feed = data.feed;
  const feedId = String(feed?.["yt:channelId"] || "");
  if (!feed || (feedId !== channel.id && `UC${feedId}` !== channel.id))
    throw new AppError(
      "FEED_INVALID",
      `${channel.name}: 채널 정보를 검증하지 못했습니다.`,
      502,
    );
  const entries = Array.isArray(feed.entry)
    ? feed.entry
    : feed.entry
      ? [feed.entry]
      : [];
  return entries
    .slice(0, 5)
    .map((entry: any) =>
      validVideo({
        id: entry["yt:videoId"],
        channelId: entry["yt:channelId"],
        channelName: channel.name,
        title: String(entry.title || ""),
        description: String(entry["media:group"]?.["media:description"] || ""),
        thumbnail: `https://i.ytimg.com/vi/${entry["yt:videoId"]}/mqdefault.jpg`,
        publishedAt: entry.published || now.toISOString(),
        fetchedAt: now.toISOString(),
        scope: "channel",
      }),
    )
    .filter((v: Video) => v.channelId === channel.id);
}
export class YouTubeSource implements VideoSource {
  async api(endpoint: string, params: Record<string, string>): Promise<any> {
    if (!process.env.YOUTUBE_API_KEY)
      throw new AppError(
        "YOUTUBE_KEY",
        "YouTube API 키를 설정해 주세요. 기본 영상 조회·사전 초안 게시에는 필요하지 않습니다.",
      );
    const url = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);
    for (const [key, value] of Object.entries(params))
      url.searchParams.set(key, value);
    return (await request(url.toString(), true)).json();
  }
  async latest() {
    const results = await Promise.allSettled(
      CHANNELS.map(async (channel) =>
        parseFeed(
          await (
            await request(
              `https://www.youtube.com/feeds/videos.xml?channel_id=${channel.id}`,
            )
          ).text(),
          channel,
        ),
      ),
    );
    const videos: Video[] = [],
      errors: string[] = [];
    results.forEach((r, i) =>
      r.status === "fulfilled"
        ? videos.push(...r.value)
        : errors.push(
            `${CHANNELS[i].name}: ${safeError(r.reason)} 저장된 목록을 표시합니다.`,
          ),
    );
    return { videos, errors };
  }
  async resolve(id: string): Promise<Video> {
    if (!/^[\w-]{11}$/.test(id))
      throw new AppError("VIDEO_ID", "올바른 영상 ID가 아닙니다.");
    if (process.env.YOUTUBE_API_KEY) {
      const result = await this.api("videos", { part: "snippet", id });
      const item = result.items?.[0];
      if (!item)
        throw new AppError(
          "VIDEO_MISSING",
          "삭제·비공개 영상이거나 존재하지 않는 영상입니다.",
          404,
        );
      return this.fromApi(item);
    }
    const html = await (
      await request(`https://www.youtube.com/watch?v=${id}&hl=ko`)
    ).text();
    const data = extractJsonAssignment(html, "ytInitialPlayerResponse") as any;
    const v = data.videoDetails;
    if (!v || v.videoId !== id)
      throw new AppError(
        "VIDEO_MISSING",
        "영상 정보를 검증할 수 없습니다.",
        502,
      );
    return validVideo({
      id,
      channelId: v.channelId,
      channelName: v.author,
      title: v.title,
      description: v.shortDescription || "",
      thumbnail: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
      publishedAt:
        data.microformat?.playerMicroformatRenderer?.publishDate ||
        new Date().toISOString(),
      fetchedAt: new Date().toISOString(),
      scope: classifyVideo(id, v.channelId),
    });
  }
  fromApi(item: any): Video {
    const s = item.snippet;
    const id = typeof item.id === "string" ? item.id : item.id.videoId;
    return validVideo({
      id,
      channelId: s.channelId,
      channelName: s.channelTitle,
      title: s.title,
      description: s.description || "",
      thumbnail: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
      publishedAt: s.publishedAt,
      fetchedAt: new Date().toISOString(),
      scope: classifyVideo(id, s.channelId),
    });
  }
  async publicEvidence(video: Video): Promise<VideoEvidence> {
    const data: VideoEvidence = {
      videoId: video.id,
      title: video.title,
      description: video.description,
      transcript: [],
      comments: [],
      transcriptStatus: "not_requested",
      commentsStatus: "unavailable",
      fetchedAt: new Date().toISOString(),
      notes: [],
    };
    try {
      const result = await this.api("commentThreads", {
        part: "snippet",
        videoId: video.id,
        order: "relevance",
        maxResults: "20",
        textFormat: "plainText",
      });
      data.comments = (result.items || []).map(
        (x: any) => x.snippet.topLevelComment.snippet.textDisplay,
      );
      data.commentsStatus = data.comments.length ? "available" : "empty";
    } catch {
      data.notes.push("인기 댓글을 확보하지 못했습니다.");
    }
    return data;
  }
  async search(): Promise<Video[]> {
    const result = await this.api("search", {
      part: "snippet",
      q: "연애",
      type: "video",
      order: "date",
      maxResults: "50",
      publishedAfter: new Date(Date.now() - 7 * 86400_000).toISOString(),
      regionCode: "KR",
      relevanceLanguage: "ko",
    });
    const ids = (result.items || []).map((x: any) => x.id.videoId).join(",");
    if (!ids) return [];
    const details = await this.api("videos", { part: "snippet", id: ids });
    return (details.items || []).map((item: any) => ({
      ...this.fromApi(item),
      scope: "discovery" as const,
    }));
  }
  async viewCounts(ids: string[]): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    for (let i = 0; i < ids.length; i += 50) {
      const data = await this.api("videos", {
        part: "statistics",
        id: ids.slice(i, i + 50).join(","),
      });
      for (const item of data.items || []) {
        const value = Number(item.statistics?.viewCount);
        if (Number.isSafeInteger(value) && value >= 0)
          result.set(item.id, value);
      }
    }
    return result;
  }
}

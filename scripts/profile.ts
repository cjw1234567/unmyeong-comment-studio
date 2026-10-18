import { PROFILES } from "../src/shared/constants.js";
import {
  openManualProfile,
  closeManualProfile,
} from "../src/server/profiles.js";
const id = process.argv[2] || "youtube1";
if (!PROFILES.some((p) => p.id === id))
  throw new Error(
    "사용법: npm run profile:open -- youtube1 (또는 youtube2, youtube3)",
  );
if (process.argv[3] === "--close") {
  await closeManualProfile(id);
  console.log("전용 프로필 종료 완료");
} else {
  await openManualProfile(id);
  console.log(
    "전용 Chrome의 YouTube에 직접 로그인하세요. 로그인 후 대시보드의 로그인 완료·창 종료 또는 profile:open -- youtube1 --close를 실행하세요.",
  );
}

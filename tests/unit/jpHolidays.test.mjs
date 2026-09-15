// ═══════════════════════════════════════════
// tests/unit/jpHolidays.test.mjs
//   node で直接実行:
//     $ node tests/unit/jpHolidays.test.mjs
//   Node 22.6+ / 24 なら `.ts` を透過的に import できる (type-stripping)。
//   tests/ は tsconfig.json の exclude に入っているのでビルド対象外。
//
//   内閣府「国民の祝日について」(2026 年公表分) と全件一致することを検証する。
// ═══════════════════════════════════════════

import { getHolidays } from "../../lib/jpHolidays.ts";

// 2026 年の内閣府公表祝日 (全 18 件)
const EXPECTED_2026 = [
  ["2026-01-01", "元日"],
  ["2026-01-12", "成人の日"],
  ["2026-02-11", "建国記念の日"],
  ["2026-02-23", "天皇誕生日"],
  ["2026-03-20", "春分の日"],
  ["2026-04-29", "昭和の日"],
  ["2026-05-03", "憲法記念日"],
  ["2026-05-04", "みどりの日"],
  ["2026-05-05", "こどもの日"],
  ["2026-05-06", "振替休日"],
  ["2026-07-20", "海の日"],
  ["2026-08-11", "山の日"],
  ["2026-09-21", "敬老の日"],
  ["2026-09-22", "国民の休日"],
  ["2026-09-23", "秋分の日"],
  ["2026-10-12", "スポーツの日"],
  ["2026-11-03", "文化の日"],
  ["2026-11-23", "勤労感謝の日"],
];

// 個別確認 (仕様書に明示された日付)
const SPOT_CHECKS = [
  ["2026-09-21", "敬老の日"],
  ["2026-09-23", "秋分の日"],
  ["2026-11-03", "文化の日"],
  ["2026-11-23", "勤労感謝の日"],
  ["2027-01-01", "元日"],
  ["2027-01-11", "成人の日"],
];

let pass = 0;
let fail = 0;
const failures = [];

function assertEq(label, actual, expected) {
  if (actual === expected) {
    pass++;
  } else {
    fail++;
    failures.push(`  × ${label}\n      actual  : ${JSON.stringify(actual)}\n      expected: ${JSON.stringify(expected)}`);
  }
}

// ── 2026 年 全件一致 ──────────────────────────
{
  const actual = getHolidays(2026);
  const actualArr = [...actual.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  assertEq(
    "2026 年の祝日総数",
    actualArr.length,
    EXPECTED_2026.length,
  );
  for (const [date, name] of EXPECTED_2026) {
    assertEq(`2026 ${date} = ${name}`, actual.get(date), name);
  }
  // 期待に無い日が入っていないか
  const expectedSet = new Set(EXPECTED_2026.map(([d]) => d));
  for (const [d, n] of actualArr) {
    if (!expectedSet.has(d)) {
      fail++;
      failures.push(`  × 期待に無い日が含まれている: ${d} = ${n}`);
    }
  }
}

// ── スポットチェック (2026-09, 2026-11, 2027-01) ────
{
  const h2026 = getHolidays(2026);
  const h2027 = getHolidays(2027);
  for (const [date, name] of SPOT_CHECKS) {
    const src = date.startsWith("2027") ? h2027 : h2026;
    assertEq(`spot ${date} = ${name}`, src.get(date), name);
  }
}

// ── 出力 ────────────────────────────────────
console.log(`── jpHolidays.test.mjs ──`);
console.log(`pass: ${pass}`);
console.log(`fail: ${fail}`);
if (fail > 0) {
  console.log(failures.join("\n"));
  process.exit(1);
}
console.log("OK");

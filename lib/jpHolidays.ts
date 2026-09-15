// ═══════════════════════════════════════════
// lib/jpHolidays.ts — 日本の祝日 (祝日法どおりの計算)
//
//   getHolidays(year): Map<"YYYY-MM-DD", "祝日名">
//     - 固定日 (元日 / 建国記念の日 / 天皇誕生日 / 昭和の日 / 憲法記念日 /
//       みどりの日 / こどもの日 / 山の日 / 文化の日 / 勤労感謝の日)
//     - ハッピーマンデー (成人の日 / 海の日 / 敬老の日 / スポーツの日 (旧体育の日))
//     - 春分の日・秋分の日 (国立天文台の近似式 1980-2099 用)
//     - 振替休日 (2007 年改正: 祝日が日曜に当たる場合、その後の最初の非祝日)
//     - 国民の休日 (祝日と祝日に挟まれた日曜以外の平日)
//
//   データ手入力 (年別テーブル) や外部 API / 追加ライブラリは一切使わない。
//   祝日法どおりの計算だけで 2026 / 2027 の内閣府公表と全一致する。
// ═══════════════════════════════════════════

const pad2 = (n: number) => String(n).padStart(2, "0");
const dateKey = (y: number, m: number, d: number) => `${y}-${pad2(m)}-${pad2(d)}`;

// 指定月の第 n 月曜日を返す (1-based)
function nthMonday(year: number, month: number, n: number): number {
  const firstDow = new Date(year, month - 1, 1).getDay(); // 0=日 .. 6=土
  const firstMon = 1 + ((1 - firstDow + 7) % 7);
  return firstMon + (n - 1) * 7;
}

// 春分の日 (1980-2099 有効な近似式、国立天文台による)
function shunbun(year: number): number {
  return Math.floor(20.8431 + 0.242194 * (year - 1980)) - Math.floor((year - 1980) / 4);
}

// 秋分の日 (1980-2099 有効な近似式)
function shuubun(year: number): number {
  return Math.floor(23.2488 + 0.242194 * (year - 1980)) - Math.floor((year - 1980) / 4);
}

export function getHolidays(year: number): Map<string, string> {
  const result = new Map<string, string>();
  const add = (m: number, d: number, name: string) => {
    result.set(dateKey(year, m, d), name);
  };

  // ── 固定日 ────────────────────────────────────────────
  add(1, 1, "元日");
  if (year >= 1967) add(2, 11, "建国記念の日");

  // 天皇誕生日: 2020- は 2/23、平成 (1989-2018) は 12/23、それ以前は 4/29
  if (year >= 2020) add(2, 23, "天皇誕生日");
  else if (year >= 1989 && year <= 2018) add(12, 23, "天皇誕生日");

  // 4/29: 2007- 昭和の日、1989-2006 みどりの日、昭和期は天皇誕生日
  if (year >= 2007) add(4, 29, "昭和の日");
  else if (year >= 1989) add(4, 29, "みどりの日");
  else if (year >= 1948) add(4, 29, "天皇誕生日");

  add(5, 3, "憲法記念日");
  if (year >= 2007) add(5, 4, "みどりの日");
  add(5, 5, "こどもの日");

  // 山の日: 2016- 8/11 (2020 は 8/10、2021 は 8/8)
  if (year === 2020) add(8, 10, "山の日");
  else if (year === 2021) add(8, 8, "山の日");
  else if (year >= 2016) add(8, 11, "山の日");

  add(11, 3, "文化の日");
  add(11, 23, "勤労感謝の日");

  // ── ハッピーマンデー ─────────────────────────────────
  // 成人の日: 2000- 1 月第 2 月曜、1948-1999 は 1/15
  if (year >= 2000) add(1, nthMonday(year, 1, 2), "成人の日");
  else if (year >= 1948) add(1, 15, "成人の日");

  // 海の日: 2003- 7 月第 3 月曜 (2020 は 7/23、2021 は 7/22)、1996-2002 は 7/20
  if (year === 2020) add(7, 23, "海の日");
  else if (year === 2021) add(7, 22, "海の日");
  else if (year >= 2003) add(7, nthMonday(year, 7, 3), "海の日");
  else if (year >= 1996) add(7, 20, "海の日");

  // 敬老の日: 2003- 9 月第 3 月曜、1966-2002 は 9/15
  if (year >= 2003) add(9, nthMonday(year, 9, 3), "敬老の日");
  else if (year >= 1966) add(9, 15, "敬老の日");

  // スポーツの日 (旧: 体育の日): 2020- 名称変更
  //   2020 は 7/24、2021 は 7/23、2000- 10 月第 2 月曜、1966-1999 は 10/10
  const sportsName = year >= 2020 ? "スポーツの日" : "体育の日";
  if (year === 2020) add(7, 24, sportsName);
  else if (year === 2021) add(7, 23, sportsName);
  else if (year >= 2000) add(10, nthMonday(year, 10, 2), sportsName);
  else if (year >= 1966) add(10, 10, sportsName);

  // ── 春分・秋分 ───────────────────────────────────────
  add(3, shunbun(year), "春分の日");
  add(9, shuubun(year), "秋分の日");

  // ── 振替休日 ─────────────────────────────────────────
  //   祝日が日曜に当たるとき、その日以降で最初の非祝日を振替休日にする。
  //   月曜も祝日ならさらに翌日へ繰り上がる。
  //   ここでは同年内に収まるものだけ追加 (年境界越えは実運用上ほぼ発生しない)。
  const originalKeys = [...result.keys()].sort();
  for (const key of originalKeys) {
    const [yy, mm, dd] = key.split("-").map(Number);
    const dt = new Date(yy, mm - 1, dd);
    if (dt.getDay() !== 0) continue; // 日曜のみ対象
    const next = new Date(yy, mm - 1, dd + 1);
    while (result.has(dateKey(next.getFullYear(), next.getMonth() + 1, next.getDate()))) {
      next.setDate(next.getDate() + 1);
    }
    if (next.getFullYear() === year) {
      result.set(dateKey(next.getFullYear(), next.getMonth() + 1, next.getDate()), "振替休日");
    }
  }

  // ── 国民の休日 ───────────────────────────────────────
  //   前日と翌日がいずれも祝日 (振替を含む) の平日 (日曜以外) は休日。
  //   典型例: 2026 年 9/21(月) 敬老・9/22(火)・9/23(水) 秋分 → 9/22 が国民の休日。
  const withSubs = new Set(result.keys());
  const yStart = new Date(year, 0, 1);
  const yEnd = new Date(year, 11, 31);
  for (const d = new Date(yStart); d <= yEnd; d.setDate(d.getDate() + 1)) {
    const key = dateKey(d.getFullYear(), d.getMonth() + 1, d.getDate());
    if (withSubs.has(key)) continue;
    if (d.getDay() === 0) continue; // 日曜はもとから休日扱い
    const prev = new Date(d); prev.setDate(prev.getDate() - 1);
    const next = new Date(d); next.setDate(next.getDate() + 1);
    const pk = dateKey(prev.getFullYear(), prev.getMonth() + 1, prev.getDate());
    const nk = dateKey(next.getFullYear(), next.getMonth() + 1, next.getDate());
    if (withSubs.has(pk) && withSubs.has(nk)) {
      result.set(key, "国民の休日");
    }
  }

  return result;
}

// ── 便宜関数 ──────────────────────────────────────────
//   月ごとの祝日を { "YYYY-MM-DD": "祝日名" } で返す。CalendarTab から使う。
export function getHolidaysForMonth(year: number, month: number): Record<string, string> {
  const all = getHolidays(year);
  const prefix = `${year}-${pad2(month)}-`;
  const out: Record<string, string> = {};
  for (const [k, v] of all) {
    if (k.startsWith(prefix)) out[k] = v;
  }
  return out;
}

// ── 色判定の 1 か所化 ────────────────────────────────
//   「日曜・祝日は赤、土曜は青、それ以外は通常色」を CalendarTab の複数箇所
//   (曜日ヘッダ・カレンダーセル・右パネル日付見出し) で共有するためのヘルパ。
//   isHoliday は getHolidaysForMonth の結果と当該日付から呼び出し側で判定して渡す。
export type DayColorKind = "sun_or_holiday" | "sat" | "weekday";

export function dayColorKind(dow: number, isHoliday: boolean): DayColorKind {
  if (dow === 0 || isHoliday) return "sun_or_holiday";
  if (dow === 6) return "sat";
  return "weekday";
}

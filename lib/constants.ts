// ═══════════════════════════════════════════
// ダイハツ明石西 勤怠アプリ — 共通定数・テーマ
// ═══════════════════════════════════════════

/** 会社ID */
export const AKASHI_COMPANY_ID = "e85e40ac-71f7-4918-b2fc-36d877337b74";

/** 有給付与日数テーブル（労基法準拠） */
export const GRANT_MONTHS = [6, 18, 30, 42, 54, 66, 78];
export const DAYS_FULL = [10, 11, 12, 14, 16, 18, 20];
export const DAYS_PART: Record<number, number[]> = {
  4: [7, 8, 9, 10, 12, 13, 15],
  3: [5, 6, 6, 8, 9, 10, 11],
  2: [3, 4, 4, 5, 6, 6, 7],
  1: [1, 2, 2, 2, 3, 3, 3],
};

/** カラーテーマ */
export const T = {
  primary:      "#e96d96",
  primaryLight: "#FDE8EF",
  text:         "#1A1A1A",
  textSec:      "#6B7280",
  textMuted:    "#9CA3AF",
  textPH:       "#C4C9D0",
  bg:           "#F5F7FA",
  border:       "#E8ECF0",
  borderLight:  "#F0F2F5",
  yukyuBlue:    "#3B82F6",
  kibouYellow:  "#EAB308",
  kinmuGreen:   "#22C55E",
  holidayRed:   "#EF4444",
  gold:         "#E6CB30",
  goldLight:    "#FFFDE7",
  success:      "#16A34A",
  danger:       "#DC2626",
  warning:      "#CA8A04",
} as const;

/** カレンダー予定カラーパレット（TimeTree準拠10色） */
export const PALETTE = [
  { n: "エメラルド", h: "#2dc653" },
  { n: "サイアン",   h: "#17a2b8" },
  { n: "スカイブルー", h: "#0d8bf2" },
  { n: "バイオレット", h: "#8b5cf6" },
  { n: "ローズ",     h: "#ec4899" },
  { n: "コーラル",   h: "#f472b6" },
  { n: "レッド",     h: "#ef4444" },
  { n: "オレンジ",   h: "#f59e0b" },
  { n: "ブラウン",   h: "#d4a574" },
  { n: "ブラック",   h: "#374151" },
] as const;

/** 曜日 */
export const DOW = ["日", "月", "火", "水", "木", "金", "土"] as const;

/** カレンダーグループ（通知送り分け単位） */
export const CAL_GROUPS = [
  { id: "all",    label: "全店舗" },
  { id: "okubo",  label: "大久保店" },
  { id: "uozumi", label: "魚住店" },
] as const;

export type CalGroupId = (typeof CAL_GROUPS)[number]["id"];

/** 店舗IDからラベルを返すユーティリティ */
export const storeLabel = (id: string): string =>
  CAL_GROUPS.find((g) => g.id === id)?.label ?? id;

/** 分 → "H:MM" 形式 */
export const fmtMin = (m: number): string =>
  `${Math.floor(Math.abs(m) / 60)}:${String(Math.abs(m) % 60).padStart(2, "0")}`;

/** 月を±1ステップ */
export const stepMonth = (
  yr: number,
  mo: number,
  dir: 1 | -1
): [number, number] => {
  let ny = yr;
  let nm = mo + dir;
  if (nm > 12) { nm = 1; ny++; }
  else if (nm < 1) { nm = 12; ny--; }
  return [ny, nm];
};

/** パート10日締め期間計算（パート: 当月11日〜翌月10日、正社員: 1日〜末日） */
export function getDateRange(yr: number, mo: number, isPart: boolean): {
  from: string;
  to: string;
  days: { dateStr: string; day: number; dow: number }[];
} {
  const p2 = (n: number) => String(n).padStart(2, "0");
  if (!isPart) {
    const dim = new Date(yr, mo, 0).getDate();
    const from = `${yr}-${p2(mo)}-01`;
    const to = `${yr}-${p2(mo)}-${p2(dim)}`;
    const days = [];
    for (let d = 1; d <= dim; d++) {
      days.push({ dateStr: `${yr}-${p2(mo)}-${p2(d)}`, day: d, dow: new Date(yr, mo - 1, d).getDay() });
    }
    return { from, to, days };
  }
  const nextMo = mo === 12 ? 1 : mo + 1;
  const nextYr = mo === 12 ? yr + 1 : yr;
  const from = `${yr}-${p2(mo)}-11`;
  const to = `${nextYr}-${p2(nextMo)}-10`;
  const days = [];
  const curEnd = new Date(yr, mo, 0).getDate();
  for (let d = 11; d <= curEnd; d++) {
    days.push({ dateStr: `${yr}-${p2(mo)}-${p2(d)}`, day: d, dow: new Date(yr, mo - 1, d).getDay() });
  }
  for (let d = 1; d <= 10; d++) {
    days.push({ dateStr: `${nextYr}-${p2(nextMo)}-${p2(d)}`, day: d, dow: new Date(nextYr, nextMo - 1, d).getDay() });
  }
  return { from, to, days };
}

// ═══════════════════════════════════════════
// パート公休 名称変更
// ═══════════════════════════════════════════
export const KOUKYU_PART_CODES = ["DA023", "DA024", "DA025", "DA026", "DA027", "DA028", "DA029", "DA030", "DA031", "DA032"] as const;

export const isKoukyuPart = (empCode: string): boolean =>
  (KOUKYU_PART_CODES as readonly string[]).includes(empCode);

export const displayReason = (reason: string | null, empCode: string): string | null => {
  if (!reason || !isKoukyuPart(empCode)) return reason;
  return reason
    .replace(/希望休（全日）/g, "公休（全日）")
    .replace(/午前希望休/g, "午前公休")
    .replace(/午後希望休/g, "午後公休");
};

export const displayChipLabel = (label: string, empCode: string): string => {
  if (!isKoukyuPart(empCode)) return label;
  return label
    .replace(/希望休（全日）/, "公休（全日）")
    .replace(/午前希望休/, "午前公休")
    .replace(/午後希望休/, "午後公休");
};
/** カレンダー用の短縮表示名（同姓自動判定 + DB上書き） */
export function calendarDisplayName(fullName: string, displayOverride?: string | null, allFullNames?: string[]): string {
  if (displayOverride) return displayOverride;
  const parts = (fullName || "").split(/\s+/);
  const surname = parts[0] || fullName;
  const given = parts[1] || "";
  if (allFullNames && given) {
    const unique = [...new Set(allFullNames)];
    if (unique.filter(n => (n || "").split(/\s+/)[0] === surname).length >= 2) {
      return surname + given.charAt(0);
    }
  }
  return surname;
}



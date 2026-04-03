// ═══════════════════════════════════════════
// KAT WORLD 勤怠アプリ — 共通定数・テーマ
// ═══════════════════════════════════════════

/** カラーテーマ */
export const T = {
  primary:      "#00AFCC",
  primaryLight: "#E6F7FA",
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
  { id: "all",        label: "全店舗" },
  { id: "kengun",     label: "健軍" },
  { id: "ozu",        label: "大津" },
  { id: "yatsushiro", label: "八代" },
  { id: "gyomu",      label: "業務部" },
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
// ═══════════════════════════════════════════
// パート公休 名称変更
// ═══════════════════════════════════════════
export const KOUKYU_PART_CODES = ["015", "020", "091"] as const;

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
/** カレンダー用の短縮表示名（同姓対策） */
const CAL_DISPLAY_OVERRIDES: Record<string, string> = {
  "018": "啓彰",
};
export function calendarDisplayName(fullName: string, empCode?: string): string {
  if (empCode && CAL_DISPLAY_OVERRIDES[empCode]) return CAL_DISPLAY_OVERRIDES[empCode];
  const parts = fullName.split(" ");
  const surname = parts[0] || fullName;
  const given = parts[1] || "";
  if (surname === "辻" || surname === "山本" || surname === "山下") {
    return surname + given.charAt(0);
  }
  return surname;
}
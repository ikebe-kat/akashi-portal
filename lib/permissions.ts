// ═══════════════════════════════════════════
// lib/permissions.ts — 全タブ共通の権限判定
// ═══════════════════════════════════════════

// ── ロール定義 ──────────────────────────
export type PermLevel = "super" | "admin" | "employee";

/**
 * employees.role（日本語）からロールレベルを判定
 * - "全店（代表）" / "全店（専務）" / "全店（人事）" / "全店（本部長）" → super
 * - "健軍店長" / "八代店長" / "経理" / "鈑金塗装" → admin
 * - その他 → employee
 */
export function getPermLevel(role: string | null): PermLevel {
  if (!role) return "employee";
  if (role === "super") return "super";
  if (role === "admin") return "admin";
  if (role.startsWith("全店")) return "super";
  if (role.includes("店長") || role.includes("経理") || role.includes("鈑金")) return "admin";
  return "employee";
}

// ══════════════════════════════════════════
// カレンダー権限
// ══════════════════════════════════════════

// ── store_id(UUID先頭8文字) → カレンダーグループ ──
const STORE_TO_CAL_GROUP: Record<string, string> = {
  "f933a681": "yatsushiro",
  "7336dda2": "okubo",
  "0141e0fe": "uozumi",
  "e43bd745": "okubo",




};

// ── 業務部判定（カレンダーグループ） ──
const GYOMU_DEPTS = ["人事", "経理", "DX", "人事総務", "DX推進"];

export function storeIdToCalGroup(storeId: string | null, department?: string | null): string {
  if (department && GYOMU_DEPTS.some((d) => department.includes(d))) return "okubo";
  if (!storeId) return "all";
  const prefix = storeId.slice(0, 8);
  return STORE_TO_CAL_GROUP[prefix] || "okubo";


// ── 特定社員のカレンダー特殊権限 ──
const SPECIAL_CAL_ACCESS: Record<string, string[]> = {



};

export function canShowCalendarGroupSelect(perm: PermLevel, employeeCode?: string): boolean {
  if (perm !== "employee") return true;
  if (employeeCode && SPECIAL_CAL_ACCESS[employeeCode]) return true;
  return false;
}

export function getAllowedCalGroups(perm: PermLevel, employeeCode?: string): string[] | null {
  if (perm !== "employee") return null;
  if (employeeCode && SPECIAL_CAL_ACCESS[employeeCode]) return SPECIAL_CAL_ACCESS[employeeCode];
  return null;
}

export function getDefaultCalendarGroup(perm: PermLevel, storeId: string | null, department?: string | null, employeeCode?: string): string {
  if (perm !== "employee") return "all";
  if (employeeCode && SPECIAL_CAL_ACCESS[employeeCode]) return SPECIAL_CAL_ACCESS[employeeCode][0];
  return storeIdToCalGroup(storeId, department);
}

export function canChooseTargetCalendar(perm: PermLevel): boolean {
  return perm !== "employee";
}

export function canDeleteEvent(
  perm: PermLevel,
  creatorEmployeeId: string,
  currentEmployeeId: string,
): boolean {
  if (creatorEmployeeId === currentEmployeeId) return true;
  return perm !== "employee";
}

// ══════════════════════════════════════════
// 名簿権限
// ══════════════════════════════════════════

export type ProfileSection = "basic" | "detail" | "sensitive";

interface RosterScope {
  type: "all" | "store_detail" | "basic_only";
  stores?: string[];
  noDependents?: boolean;
}

const ROSTER_SCOPES: Record<string, RosterScope> = {
  "DA01": { type: "store_detail", stores: ["0141e0fe"], noDependents: true },  // 雨宮 → 魚住店のみdetail
  "DA02": { type: "store_detail", stores: ["7336dda2"], noDependents: true },  // 押谷 → 大久保店のみdetail


};

export function canSeeProfile(
  viewerPerm: PermLevel,
  viewerCode: string,
  isSelf: boolean,
  targetStoreId: string | null,
  section: ProfileSection,
): boolean {
  if (isSelf) return section !== "sensitive";
  if (viewerPerm === "super") return true;

  const scope = ROSTER_SCOPES[viewerCode];
  if (scope) {
    if (scope.type === "basic_only") return section === "basic";
    if (section === "sensitive") return false;
    if (scope.type === "all") return true;
    if (scope.type === "store_detail" && targetStoreId) {
      const prefix = targetStoreId.slice(0, 8);
      if (scope.stores?.includes(prefix)) return true;
    }
    return section === "basic";
  }

  return section === "basic";
}

// ══════════════════════════════════════════
// 打刻修正権限（管理者画面で今後使用）
// ══════════════════════════════════════════

interface PunchEditScope {
  type: "all" | "stores" | "department" | "none";
  stores?: string[];
  department?: string;
}

const PUNCH_EDIT_SCOPES: Record<string, PunchEditScope> = {
  "D02": { type: "all" },                                          // 代表
  "D18": { type: "all" },                                          // 専務
  "D67": { type: "all" },                                          // 池邉
  "D49": { type: "all" },                                          // 岩永
  "DA01": { type: "stores", stores: ["0141e0fe"] },                // 雨宮 → 魚住店
  "DA02": { type: "stores", stores: ["7336dda2"] },                // 押谷 → 大久保店

};

export function canEditPunch(
  editorCode: string,
  targetStoreId: string | null,
  targetDepartment: string | null,
): boolean {
  const scope = PUNCH_EDIT_SCOPES[editorCode];
  if (!scope) return false;
  if (scope.type === "all") return true;
  if (scope.type === "stores" && targetStoreId) {
    const prefix = targetStoreId.slice(0, 8);
    return scope.stores?.includes(prefix) || false;
  }
  if (scope.type === "department" && targetDepartment) {
    return targetDepartment.includes(scope.department || "");
  }
  return false;
}

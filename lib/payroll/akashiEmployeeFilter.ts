// lib/payroll/akashiEmployeeFilter.ts
// 明石ポータル上で「その社員が本部（KAT本部）の役員か」を判定する共通関数。
// 給与計算・給与画面・社労士出力・従業員一覧・承認画面の権限判定などから参照される。
// 店舗名は変更されうるため、stores.id で判定する（1箇所の定数だけ更新すればよい）。

/**
 * 明石の本部店舗 (stores.store_name = '本部') の id。
 * KAT本部の役員（代表取締役・専務・部長など）はここに所属しており、
 * 明石の給与・勤怠・給与画面・社労士出力から除外する（0円行も作らない）。
 */
export const AKASHI_HONBU_STORE_ID = 'e43bd745-b8f2-4705-9fd8-43517dc47701';

export interface AkashiEmployeeFilterInput {
  employee_code?: string;
  store_id: string | null | undefined;
}

/**
 * 対象の社員が明石本部（KAT本部）に所属しているかを判定する。
 * true  = 本部所属（給与計算・給与画面・社労士出力の対象外、承認画面では全件権限）
 * false = 本部以外（明石正社員・パート・産休中の従業員など）
 *
 * 産休中で requires_punch=false の従業員（例: DA037 松江）は本部所属ではないため
 * false を返す。calculatePayroll 側で createZeroResult による 0 円行が作られる。
 */
export function isExcludedFromAkashiPayroll(emp: AkashiEmployeeFilterInput): boolean {
  return emp.store_id === AKASHI_HONBU_STORE_ID;
}

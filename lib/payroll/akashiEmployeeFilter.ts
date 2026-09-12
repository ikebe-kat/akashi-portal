// lib/payroll/akashiEmployeeFilter.ts
// 明石ポータル上で「その社員が明石の給与・勤怠の対象か」を判定する共通関数。
// 給与計算・給与画面・社労士出力・従業員一覧などから重複して参照される。
// 店舗名は変更されうるため、stores.id で判定する（1箇所の定数だけ更新すればよい）。

import { HONBU_EMPLOYEE_CODES } from '@/lib/constants';

/**
 * 明石の本部店舗 (stores.store_name = '本部') の id。
 * KAT本部の役員（代表取締役・専務・部長など）はここに所属しており、
 * 明石の給与・勤怠・給与画面・社労士出力から除外する。
 *
 * docs/sql/20260912_get_akashi_honbu_store_id.sql を SQL Editor で実行し、
 * 得られた uuid をこの定数に入れる。
 *
 * ※ 空文字のうちは暫定フォールバックとして HONBU_EMPLOYEE_CODES で判定する。
 *    id を入れたら HONBU_EMPLOYEE_CODES 定数とフォールバック分岐を両方削除すること。
 */
export const AKASHI_HONBU_STORE_ID: string = '';

export interface AkashiEmployeeFilterInput {
  employee_code: string;
  store_id: string | null | undefined;
}

/**
 * 明石ポータルの給与・勤怠・給与画面・社労士出力の対象外か判定する。
 * true  = 対象外（KAT本部の役員：D02/D18/D49/D67 など、明石側では扱わない）
 * false = 対象（明石正社員・パート・産休中の従業員など）
 *
 * 産休中で requires_punch=false の従業員（例: DA037 松江）は「対象」であり、
 * calculatePayroll 側で createZeroResult による 0 円行が作られる。ここでは除外しない。
 */
export function isExcludedFromAkashiPayroll(emp: AkashiEmployeeFilterInput): boolean {
  if (AKASHI_HONBU_STORE_ID && emp.store_id === AKASHI_HONBU_STORE_ID) return true;
  // id 未確定時の暫定フォールバック。id を埋めたらこの2行と HONBU_EMPLOYEE_CODES を削除。
  return HONBU_EMPLOYEE_CODES.includes(emp.employee_code);
}

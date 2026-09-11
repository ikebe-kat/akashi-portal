// lib/payroll/timeUnits.ts
// DBの NUMERIC 時間値（時間・小数）を分の整数値に統一するための共通関数。
// 月次サマリ（AdminTab）と社労士出力（SharoushiSub）は同じ変換式を使う必要があるため、
// ここに一本化する。丸めは Math.round（±30秒でズレる可能性はDB側の格納精度依存）。
export function hoursToMinutes(hours: number | string | null | undefined): number {
  if (hours == null) return 0;
  const n = typeof hours === 'number' ? hours : Number(hours);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 60);
}

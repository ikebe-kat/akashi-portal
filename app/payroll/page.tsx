// app/payroll/page.tsx
// akashi-portal 給与計算一覧画面
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { calculateAll, savePayrollResults } from '@/lib/payroll/calculatePayroll';
import type { PayrollResult } from '@/lib/payroll/types';

const AKASHI_COMPANY_ID = 'e85e40ac-71f7-4918-b2fc-36d877337b74';

// 支給年月の選択肢を生成（現在月 ± 6ヶ月）
function generateYearMonthOptions(): string[] {
  const options: string[] = [];
  const now = new Date();
  for (let i = -6; i <= 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    options.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return options;
}

// デフォルトの支給年月（現在月）
function getDefaultYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export default function PayrollPage() {
  const router = useRouter();
  const [yearMonth, setYearMonth] = useState(getDefaultYearMonth());
  const [results, setResults] = useState<PayrollResult[]>([]);
  const [savedResults, setSavedResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const yearMonthOptions = generateYearMonthOptions();

  // 保存済みデータの読み込み
  const loadSavedResults = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('payroll_monthly')
        .select(`
          *,
          employees (
            employee_code,
            full_name,
            employment_type
          )
        `)
        .eq('company_id', AKASHI_COMPANY_ID)
        .eq('target_year', parseInt(yearMonth.split('-')[0]))
        .eq('target_month', parseInt(yearMonth.split('-')[1]))
        .order('employee_id');

      if (fetchError) throw fetchError;
      setSavedResults(data || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [yearMonth]);

  useEffect(() => {
    loadSavedResults();
  }, [loadSavedResults]);

  // 計算実行
  const handleCalculate = async () => {
    // 既存データがあれば確認ダイアログ
    if (savedResults.length > 0 && !showConfirm) {
      setShowConfirm(true);
      return;
    }

    setShowConfirm(false);
    setCalculating(true);
    setError(null);

    try {
      const calcResults = await calculateAll({ yearMonth });
      await savePayrollResults(calcResults, yearMonth);
      setResults(calcResults);
      await loadSavedResults();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCalculating(false);
    }
  };

  // 表示用データ（保存済みをベースに表示）
  const displayData = savedResults.map((r: any) => ({
    id: r.id,
    employee_id: r.employee_id,
    employee_code: r.employees?.employee_code || '',
    employee_name: r.employees?.full_name || '',
    employment_type: r.employment_type,
    work_days: r.work_days,
    gross_total: r.total_payment,
    has_warning: r.overtime_exceeded,
    is_manual_adjusted: false,
    calculated_at: r.calculated_at,
  }));

  // 正社員とパートで分離
  const fulltimeData = displayData.filter(d => d.employment_type !== 'パート');
  const parttimeData = displayData.filter(d => d.employment_type === 'パート');

  // 対象期間の表示
  const [y, m] = yearMonth.split('-').map(Number);
  const prevM = m === 1 ? 12 : m - 1;
  const prevY = m === 1 ? y - 1 : y;
  const fulltimePeriodStr = `${prevY}/${prevM}/1〜${prevY}/${prevM}/${new Date(prevY, prevM, 0).getDate()}`;
  const parttimePeriodStr = `${prevY}/${prevM}/11〜${y}/${m}/10`;

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '24px' }}>
        給与計算
      </h1>

      {/* 操作エリア */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        marginBottom: '24px',
        padding: '16px',
        backgroundColor: '#f8f9fa',
        borderRadius: '8px',
      }}>
        <label style={{ fontWeight: 'bold' }}>支給年月:</label>
        <select
          value={yearMonth}
          onChange={(e) => setYearMonth(e.target.value)}
          style={{
            padding: '8px 12px',
            borderRadius: '4px',
            border: '1px solid #ccc',
            fontSize: '16px',
          }}
        >
          {yearMonthOptions.map(ym => (
            <option key={ym} value={ym}>{ym.replace('-', '年')}月</option>
          ))}
        </select>

        <button
          onClick={handleCalculate}
          disabled={calculating}
          style={{
            padding: '10px 24px',
            backgroundColor: calculating ? '#ccc' : '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '16px',
            fontWeight: 'bold',
            cursor: calculating ? 'not-allowed' : 'pointer',
          }}
        >
          {calculating ? '計算中...' : '計算実行'}
        </button>

        {savedResults.length > 0 && (
          <span style={{ color: '#666', fontSize: '14px' }}>
            最終計算: {new Date(savedResults[0]?.calculated_at).toLocaleString('ja-JP')}
          </span>
        )}
      </div>

      {/* 上書き確認ダイアログ */}
      {showConfirm && (
        <div style={{
          padding: '16px',
          marginBottom: '16px',
          backgroundColor: '#fff3cd',
          border: '1px solid #ffc107',
          borderRadius: '8px',
        }}>
          <p style={{ fontWeight: 'bold', marginBottom: '8px' }}>
            ⚠️ {yearMonth.replace('-', '年')}月の給与データが既に存在します。上書きしますか？
          </p>
          <p style={{ fontSize: '14px', color: '#666', marginBottom: '12px' }}>
            ※ 手入力した調整手当は引き継がれます。手修正した金額は初期値に戻ります。
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleCalculate}
              style={{
                padding: '8px 16px',
                backgroundColor: '#dc3545',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              上書きする
            </button>
            <button
              onClick={() => setShowConfirm(false)}
              style={{
                padding: '8px 16px',
                backgroundColor: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* エラー表示 */}
      {error && (
        <div style={{
          padding: '12px',
          marginBottom: '16px',
          backgroundColor: '#f8d7da',
          border: '1px solid #f5c6cb',
          borderRadius: '8px',
          color: '#721c24',
        }}>
          {error}
        </div>
      )}

      {/* 対象期間表示 */}
      {savedResults.length > 0 && (
        <div style={{ marginBottom: '16px', fontSize: '14px', color: '#555' }}>
          <span>正社員対象期間: {fulltimePeriodStr}</span>
          <span style={{ marginLeft: '24px' }}>パート対象期間: {parttimePeriodStr}</span>
        </div>
      )}

      {loading && <p>読み込み中...</p>}

      {/* 正社員テーブル */}
      {fulltimeData.length > 0 && (
        <>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '12px', marginTop: '24px' }}>
            正社員（月給制）
          </h2>
          <PayrollTable data={fulltimeData} onRowClick={(empId) => router.push(`/payroll/${empId}?ym=${yearMonth}`)} />
        </>
      )}

      {/* パートテーブル */}
      {parttimeData.length > 0 && (
        <>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '12px', marginTop: '32px' }}>
            パート（時給制）
          </h2>
          <PayrollTable data={parttimeData} onRowClick={(empId) => router.push(`/payroll/${empId}?ym=${yearMonth}`)} />
        </>
      )}

      {!loading && savedResults.length === 0 && (
        <p style={{ color: '#888', marginTop: '32px', textAlign: 'center' }}>
          {yearMonth.replace('-', '年')}月の給与データはまだありません。「計算実行」を押してください。
        </p>
      )}
    </div>
  );
}

// 給与一覧テーブルコンポーネント
function PayrollTable({
  data,
  onRowClick,
}: {
  data: {
    employee_id: string;
    employee_code: string;
    employee_name: string;
    employment_type: string;
    work_days: number;
    gross_total: number;
    has_warning: boolean;
    is_manual_adjusted: boolean;
  }[];
  onRowClick: (employeeId: string) => void;
}) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: '14px',
      }}>
        <thead>
          <tr style={{ backgroundColor: '#f1f3f5' }}>
            <th style={thStyle}>コード</th>
            <th style={thStyle}>氏名</th>
            <th style={thStyle}>区分</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>出勤日数</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>支給合計</th>
            <th style={thStyle}>状態</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr
              key={row.employee_id}
              onClick={() => onRowClick(row.employee_id)}
              style={{
                cursor: 'pointer',
                borderBottom: '1px solid #dee2e6',
                backgroundColor: row.has_warning ? '#fff3cd' : 'transparent',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = row.has_warning ? '#ffe69c' : '#f8f9fa'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = row.has_warning ? '#fff3cd' : 'transparent'; }}
            >
              <td style={tdStyle}>{row.employee_code}</td>
              <td style={tdStyle}>{row.employee_name}</td>
              <td style={tdStyle}>{row.employment_type}</td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>{row.work_days}日</td>
              <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 'bold' }}>
                ¥{row.gross_total.toLocaleString()}
              </td>
              <td style={tdStyle}>
                {row.has_warning && <span style={{ color: '#dc3545' }}>⚠️ 要確認</span>}
                {row.is_manual_adjusted && <span style={{ color: '#0d6efd', marginLeft: '4px' }}>✏️ 修正済</span>}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ backgroundColor: '#e9ecef', fontWeight: 'bold' }}>
            <td style={tdStyle} colSpan={4}>合計</td>
            <td style={{ ...tdStyle, textAlign: 'right' }}>
              ¥{data.reduce((sum, r) => sum + r.gross_total, 0).toLocaleString()}
            </td>
            <td style={tdStyle}></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '10px 12px',
  textAlign: 'left',
  fontWeight: 'bold',
  borderBottom: '2px solid #dee2e6',
};

const tdStyle: React.CSSProperties = {
  padding: '10px 12px',
};

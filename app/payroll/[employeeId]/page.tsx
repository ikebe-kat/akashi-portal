// app/payroll/[employeeId]/page.tsx
// akashi-portal 給与計算 個人詳細画面（手修正可能）
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const AKASHI_COMPANY_ID = 'e85e40ac-71f7-4918-b2fc-36d877337b74';

interface PayrollDetail {
  id: string;
  employee_id: string;
  target_year: number;
  target_month: number;
  employment_type: string;
  period_start: string;
  period_end: string;
  work_days: number;
  actual_work_minutes: number;
  overtime_minutes: number;
  absence_days: number;
  hourly_hourly_weekday_minutes: number;
  hourly_hourly_saturday_minutes: number;
  hourly_hourly_sunday_minutes: number;
  hourly_rate_weekday: number | null;
  hourly_rate_saturday: number | null;
  hourly_rate_sunday: number | null;
  overtime_unit_price: number;
  fixed_overtime_hours: number;
  base_salary: number;
  position_allowance: number;
  qualification_allowance: number;
  commute_allowance: number;
  dependent_allowance: number;
  fixed_overtime: number;
  overtime_pay: number;
  adjustment_allowance: number;
  absence_deduction: number;
  total_payment: number;
  status: string;
  overtime_exceeded: boolean;
  admin_note: string | null;
  calculated_at: string;
  employees?: {
    employee_code: string;
    full_name: string;
  };
}

export default function PayrollDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const employeeId = params.employeeId as string;
  const yearMonth = searchParams.get('ym') || '';

  const [data, setData] = useState<PayrollDetail | null>(null);
  const [editData, setEditData] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: row, error: fetchError } = await supabase
        .from('payroll_monthly')
        .select(`
          *,
          employees (employee_code, full_name)
        `)
        .eq('employee_id', employeeId)
        .eq('target_year', parseInt(yearMonth.split('-')[0]))
        .eq('target_month', parseInt(yearMonth.split('-')[1]))
        .eq('company_id', AKASHI_COMPANY_ID)
        .single();

      if (fetchError) throw fetchError;
      setData(row);
      // 編集用の初期値
      setEditData({
        base_salary: row.base_salary,
        position_allowance: row.position_allowance,
        qualification_allowance: row.qualification_allowance,
        commute_allowance: row.commute_allowance,
        dependent_allowance: row.dependent_allowance,
        fixed_overtime: row.fixed_overtime,
        overtime_pay: row.overtime_pay,
        adjustment_allowance: row.adjustment_allowance,
        absence_deduction: row.absence_deduction,
        // パート曜日別
        hourly_hourly_weekday_minutes: row.hourly_hourly_weekday_minutes,
        hourly_hourly_saturday_minutes: row.hourly_hourly_saturday_minutes,
        hourly_hourly_sunday_minutes: row.hourly_hourly_sunday_minutes,
        hourly_rate_weekday: row.hourly_rate_weekday || 0,
        hourly_rate_saturday: row.hourly_rate_saturday || 0,
        hourly_rate_sunday: row.hourly_rate_sunday || 0,
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [employeeId, yearMonth]);

  useEffect(() => {
    if (employeeId && yearMonth) loadData();
  }, [loadData, employeeId, yearMonth]);

  // 支給合計の再計算
  const calcGrossTotal = (): number => {
    if (!data) return 0;
    const isParttime = data.employment_type === 'パート';

    if (isParttime) {
      // パート: (平日分+土曜分+日曜分) + 通勤手当 + 調整手当
      const baseSalary = Math.round(
        ((editData.hourly_weekday_minutes || 0) / 60) * (editData.hourly_rate_weekday || 0)
        + ((editData.hourly_saturday_minutes || 0) / 60) * (editData.hourly_rate_saturday || 0)
        + ((editData.hourly_sunday_minutes || 0) / 60) * (editData.hourly_rate_sunday || 0)
      );
      return baseSalary + (editData.commute_allowance || 0) + (editData.adjustment_allowance || 0);
    } else {
      // 正社員
      return (editData.base_salary || 0)
        + (editData.position_allowance || 0)
        + (editData.qualification_allowance || 0)
        + (editData.commute_allowance || 0)
        + (editData.dependent_allowance || 0)
        + (editData.fixed_overtime || 0)
        + (editData.overtime_pay || 0)
        + (editData.adjustment_allowance || 0)
        - (editData.absence_deduction || 0);
    }
  };

  // 保存
  const handleSave = async () => {
    if (!data) return;
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const grossTotal = calcGrossTotal();
      const isParttime = data.employment_type === 'パート';

      const updateFields: any = {
        adjustment_allowance: editData.adjustment_allowance || 0,
        total_payment: grossTotal,
        calculated_at: new Date().toISOString(),
      };

      if (isParttime) {
        // パート: 曜日別時間・時給も保存
        const baseSalary = Math.round(
          ((editData.hourly_weekday_minutes || 0) / 60) * (editData.hourly_rate_weekday || 0)
          + ((editData.hourly_saturday_minutes || 0) / 60) * (editData.hourly_rate_saturday || 0)
          + ((editData.hourly_sunday_minutes || 0) / 60) * (editData.hourly_rate_sunday || 0)
        );
        updateFields.hourly_weekday_minutes = editData.hourly_weekday_minutes || 0;
        updateFields.hourly_saturday_minutes = editData.hourly_saturday_minutes || 0;
        updateFields.hourly_sunday_minutes = editData.hourly_sunday_minutes || 0;
        updateFields.base_salary = baseSalary;
        updateFields.commute_allowance = editData.commute_allowance || 0;
      } else {
        // 正社員: 各項目を保存
        updateFields.base_salary = editData.base_salary || 0;
        updateFields.position_allowance = editData.position_allowance || 0;
        updateFields.qualification_allowance = editData.qualification_allowance || 0;
        updateFields.commute_allowance = editData.commute_allowance || 0;
        updateFields.dependent_allowance = editData.dependent_allowance || 0;
        updateFields.fixed_overtime = editData.fixed_overtime || 0;
        updateFields.overtime_pay = editData.overtime_pay || 0;
        updateFields.absence_deduction = editData.absence_deduction || 0;
      }

      const { error: updateError } = await supabase
        .from('payroll_monthly')
        .update(updateFields)
        .eq('id', data.id);

      if (updateError) throw updateError;
      setSuccess(true);
      await loadData();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleFieldChange = (field: string, value: string) => {
    const num = parseInt(value) || 0;
    setEditData(prev => ({ ...prev, [field]: num }));
  };

  if (loading) return <div style={{ padding: '24px' }}>読み込み中...</div>;
  if (!data) return <div style={{ padding: '24px' }}>データが見つかりません</div>;

  const isParttime = data.employment_type === 'パート';
  const grossTotal = calcGrossTotal();

  return (
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
      {/* ヘッダー */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
        <button
          onClick={() => router.push(`/payroll?ym=${yearMonth}`)}
          style={{
            padding: '8px 16px',
            backgroundColor: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          ← 一覧に戻る
        </button>
        <h1 style={{ fontSize: '20px', fontWeight: 'bold' }}>
          {data.employees?.employee_code} {data.employees?.full_name}
          <span style={{ fontSize: '14px', fontWeight: 'normal', marginLeft: '12px', color: '#666' }}>
            {yearMonth.replace('-', '年')}月 給与明細
          </span>
        </h1>
      </div>

      {/* 警告 */}
      {data.overtime_exceeded && (
        <div style={{
          padding: '12px',
          marginBottom: '16px',
          backgroundColor: '#fff3cd',
          border: '1px solid #ffc107',
          borderRadius: '8px',
        }}>
          <strong>⚠️ 要確認:</strong>
          <ul style={{ margin: '8px 0 0 16px' }}>
            {(data.admin_note ? [data.admin_note] : []).map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <div style={{ padding: '12px', marginBottom: '16px', backgroundColor: '#f8d7da', borderRadius: '8px', color: '#721c24' }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{ padding: '12px', marginBottom: '16px', backgroundColor: '#d4edda', borderRadius: '8px', color: '#155724' }}>
          保存しました
        </div>
      )}

      {/* 基本情報 */}
      <Section title="基本情報">
        <InfoRow label="区分" value={data.employment_type} />
        <InfoRow label="対象期間" value={`${data.period_start} 〜 ${data.period_end}`} />
        <InfoRow label="出勤日数" value={`${data.work_days}日`} />
        <InfoRow label="総労働時間" value={formatMinutes(data.actual_work_minutes)} />
        {!isParttime && (
          <>
            <InfoRow label="残業時間" value={formatMinutes(data.overtime_minutes)} />
            <InfoRow label="欠勤日数" value={`${data.absence_days}日`} />
            {/* 当月所定時間は計算ロジック側で使用 */}
            <InfoRow label="残業単価" value={`¥${Math.round(data.overtime_unit_price).toLocaleString()}/h`} />
          </>
        )}
      </Section>

      {/* パート: 曜日別明細 */}
      {isParttime && (
        <Section title="曜日別労働時間・時給">
          <EditableMinutesRow
            label="平日"
            minutesField="hourly_weekday_minutes"
            rateField="hourly_rate_weekday"
            editData={editData}
            onChange={handleFieldChange}
          />
          <EditableMinutesRow
            label="土曜"
            minutesField="hourly_saturday_minutes"
            rateField="hourly_rate_saturday"
            editData={editData}
            onChange={handleFieldChange}
          />
          <EditableMinutesRow
            label="日曜"
            minutesField="hourly_sunday_minutes"
            rateField="hourly_rate_sunday"
            editData={editData}
            onChange={handleFieldChange}
          />
          <div style={{ borderTop: '2px solid #333', marginTop: '8px', paddingTop: '8px' }}>
            <InfoRow
              label="基本給与（合計）"
              value={`¥${Math.round(
                ((editData.hourly_weekday_minutes || 0) / 60) * (editData.hourly_rate_weekday || 0)
                + ((editData.hourly_saturday_minutes || 0) / 60) * (editData.hourly_rate_saturday || 0)
                + ((editData.hourly_sunday_minutes || 0) / 60) * (editData.hourly_rate_sunday || 0)
              ).toLocaleString()}`}
              bold
            />
          </div>
        </Section>
      )}

      {/* 支給項目 */}
      <Section title="支給項目">
        {!isParttime ? (
          <>
            <EditableRow label="基本給" field="base_salary" editData={editData} onChange={handleFieldChange} />
            <EditableRow label="役職手当" field="position_allowance" editData={editData} onChange={handleFieldChange} />
            <EditableRow label="資格手当" field="qualification_allowance" editData={editData} onChange={handleFieldChange} />
            <EditableRow label="通勤手当" field="commute_allowance" editData={editData} onChange={handleFieldChange} />
            <EditableRow label="扶養手当" field="dependent_allowance" editData={editData} onChange={handleFieldChange} />
            <EditableRow label="固定残業手当" field="fixed_overtime" editData={editData} onChange={handleFieldChange} />
            <EditableRow label="超過残業手当" field="overtime_pay" editData={editData} onChange={handleFieldChange} />
          </>
        ) : (
          <EditableRow label="通勤手当" field="commute_allowance" editData={editData} onChange={handleFieldChange} />
        )}
        <EditableRow label="調整手当" field="adjustment_allowance" editData={editData} onChange={handleFieldChange} highlight />
      </Section>

      {/* 控除項目（正社員のみ） */}
      {!isParttime && (
        <Section title="控除項目">
          <EditableRow label="欠勤控除" field="absence_deduction" editData={editData} onChange={handleFieldChange} />
        </Section>
      )}

      {/* 支給合計 */}
      <div style={{
        padding: '16px',
        marginTop: '24px',
        backgroundColor: '#e8f4fd',
        borderRadius: '8px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span style={{ fontSize: '18px', fontWeight: 'bold' }}>支給合計</span>
        <span style={{ fontSize: '24px', fontWeight: 'bold', color: '#2563eb' }}>
          ¥{grossTotal.toLocaleString()}
        </span>
      </div>

      {/* 修正フラグ */}
      {(data.status === 'confirmed') && (
        <p style={{ fontSize: '12px', color: '#666', marginTop: '8px' }}>
          ✏️ この明細は手修正されています
        </p>
      )}

      {/* 保存ボタン */}
      <div style={{ marginTop: '24px', display: 'flex', gap: '12px' }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '12px 32px',
            backgroundColor: saving ? '#ccc' : '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '16px',
            fontWeight: 'bold',
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? '保存中...' : '保存'}
        </button>
      </div>
    </div>
  );
}

// ============================================
// 共通コンポーネント
// ============================================

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: '24px' }}>
      <h2 style={{
        fontSize: '16px',
        fontWeight: 'bold',
        paddingBottom: '8px',
        borderBottom: '2px solid #2563eb',
        marginBottom: '12px',
      }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function InfoRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      padding: '6px 0',
      borderBottom: '1px solid #eee',
      fontWeight: bold ? 'bold' : 'normal',
    }}>
      <span style={{ color: '#555' }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function EditableRow({
  label,
  field,
  editData,
  onChange,
  highlight,
}: {
  label: string;
  field: string;
  editData: Record<string, number>;
  onChange: (field: string, value: string) => void;
  highlight?: boolean;
}) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '6px 0',
      borderBottom: '1px solid #eee',
      backgroundColor: highlight ? '#fffbeb' : 'transparent',
    }}>
      <span style={{ color: '#555' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <span>¥</span>
        <input
          type="number"
          value={editData[field] || 0}
          onChange={(e) => onChange(field, e.target.value)}
          style={{
            width: '120px',
            padding: '4px 8px',
            border: '1px solid #ccc',
            borderRadius: '4px',
            textAlign: 'right',
            fontSize: '14px',
          }}
        />
      </div>
    </div>
  );
}

function EditableMinutesRow({
  label,
  minutesField,
  rateField,
  editData,
  onChange,
}: {
  label: string;
  minutesField: string;
  rateField: string;
  editData: Record<string, number>;
  onChange: (field: string, value: string) => void;
}) {
  const minutes = editData[minutesField] || 0;
  const rate = editData[rateField] || 0;
  const amount = Math.round((minutes / 60) * rate);

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '80px 1fr 1fr 100px',
      gap: '8px',
      alignItems: 'center',
      padding: '6px 0',
      borderBottom: '1px solid #eee',
    }}>
      <span style={{ color: '#555', fontWeight: 'bold' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <input
          type="number"
          value={minutes}
          onChange={(e) => onChange(minutesField, e.target.value)}
          style={{
            width: '80px',
            padding: '4px 8px',
            border: '1px solid #ccc',
            borderRadius: '4px',
            textAlign: 'right',
          }}
        />
        <span style={{ fontSize: '12px', color: '#888' }}>分 ({formatMinutes(minutes)})</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <span>×¥</span>
        <input
          type="number"
          value={rate}
          onChange={(e) => onChange(rateField, e.target.value)}
          style={{
            width: '80px',
            padding: '4px 8px',
            border: '1px solid #ccc',
            borderRadius: '4px',
            textAlign: 'right',
          }}
        />
      </div>
      <span style={{ textAlign: 'right', fontWeight: 'bold' }}>¥{amount.toLocaleString()}</span>
    </div>
  );
}

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}時間${m > 0 ? m + '分' : ''}`;
}

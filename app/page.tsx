'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { AKASHI_COMPANY_ID } from '@/lib/constants'
export default function LoginPage() {
  const router = useRouter()
  const [employeeCode, setEmployeeCode] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem('employee')
    if (stored) {
      router.push('/home')
      return
    }
    const params = new URLSearchParams(window.location.search)
    const token = params.get('portal_token')
    if (token) {
      autoLogin(decodeURIComponent(token))
      return
    }
    setChecking(false)
  }, [])

  // employees + stores（pin は employee_pins から別取得）
  const EMP_COLS = 'id, employee_code, full_name, full_name_kana, department, position, store_id, company_id, holiday_calendar, holiday_pattern, work_pattern_code, requires_punch, role, employment_type, portal_group_id, stores(store_name)'

  // pin 取得：employee_pins.pin → だめなら employees.pin にフォールバック
  const fetchPin = async (employeeId: string): Promise<string | null> => {
    const { data: pinRow } = await supabase
      .from('employee_pins').select('pin').eq('employee_id', employeeId).maybeSingle()
    if (pinRow?.pin != null) return pinRow.pin as string
    const { data: legacy } = await supabase
      .from('employees').select('pin').eq('id', employeeId).maybeSingle()
    return (legacy as any)?.pin ?? null
  }

  const finishLogin = async (data: any) => {
    const dbPin = await fetchPin(data.id)
    const empData = { ...data, store_name: (data as any).stores?.store_name || '', pin: dbPin }
    delete (empData as any).stores
    localStorage.setItem('employee', JSON.stringify(empData))
  }

  const autoLogin = async (pgId: string) => {
    const { data, error } = await supabase
      .from('employees').select(EMP_COLS)
      .eq('portal_group_id', pgId).eq('company_id', AKASHI_COMPANY_ID).maybeSingle()
    if (error || !data) { setChecking(false); return }
    await finishLogin(data)
    window.history.replaceState({}, '', '/')
    router.push('/home')
  }

  const handleLogin = async () => {
    setError('')
    setLoading(true)
    const code = employeeCode.toUpperCase().trim()
    const { data, error: dbError } = await supabase
      .from('employees').select(EMP_COLS)
      .eq('employee_code', code).eq('company_id', AKASHI_COMPANY_ID).maybeSingle()
    if (dbError) {
      setLoading(false)
      console.error('employees select error:', dbError)
      setError('ログインに失敗しました（' + dbError.message + '）')
      return
    }
    if (!data) {
      setLoading(false)
      setError('社員CDが見つかりません')
      return
    }
    const dbPin = await fetchPin(data.id)
    setLoading(false)
    if (dbPin == null) { setError('PINが登録されていません。管理者に連絡してください'); return }
    if (dbPin !== pin) { setError('PINが正しくありません'); return }
    const empData = { ...data, store_name: (data as any).stores?.store_name || '', pin: dbPin }
    delete (empData as any).stores
    localStorage.setItem('employee', JSON.stringify(empData))
    router.push('/home')
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400 text-sm">読み込み中...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded shadow-sm border border-gray-100 p-8 w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/daihatsu_logo.png" alt="ダイハツ明石西" className="h-16 mx-auto mb-4" />
          <p className="text-gray-400 text-xs tracking-widest">社内ポータル</p>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-gray-500 text-xs mb-1 block">社員CD</label>
            <input
              type="text"
              value={employeeCode}
              onChange={(e) => setEmployeeCode(e.target.value)}
              placeholder="例: DA001"
              className="w-full border border-gray-200 rounded px-4 py-3 text-gray-800 placeholder-gray-300 focus:outline-none focus:border-pink-400 text-lg"
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            />
          </div>
          <div>
            <label className="text-gray-500 text-xs mb-1 block">PIN</label>
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="****"
              className="w-full border border-gray-200 rounded px-4 py-3 text-gray-800 placeholder-gray-300 focus:outline-none focus:border-pink-400 text-lg"
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            />
          </div>
          {error && <p className="text-pink-500 text-sm text-center">{error}</p>}
          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full text-white font-bold py-3.5 rounded text-base shadow-sm transition-all active:scale-95 mt-2"
            style={{ backgroundColor: loading ? '#f0a0b8' : '#e96d96' }}
          >
            {loading ? 'ログイン中...' : 'ログイン'}
          </button>
        </div>
      </div>
      <p className="text-gray-300 text-xs mt-6">© 株式会社ダイハツ明石西</p>
    </div>
  )
}

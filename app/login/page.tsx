'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [employeeCode, setEmployeeCode] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    setError('')
    setLoading(true)
    const code = employeeCode.padStart(3, '0')

    const { data, error: dbError } = await supabase
      .from('employees')
      .select('id, employee_code, full_name, full_name_kana, department, position, store_id, company_id, pin')
      .eq('employee_code', code)
      .single()

    setLoading(false)

    if (dbError || !data) {
      setError('社員CDが見つかりません')
      return
    }

    if (data.pin !== pin) {
      setError('PINが正しくありません')
      return
    }

    sessionStorage.setItem('employee', JSON.stringify(data))
    router.push('/home')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded shadow-sm border border-gray-100 p-8 w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/KAT_logo_-05.png" alt="KAT WORLD" className="h-16 mx-auto mb-4" />
          <p className="text-gray-400 text-xs tracking-widest">勤怠管理システム</p>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-gray-500 text-xs mb-1 block">社員CD</label>
            <input
              type="text"
              value={employeeCode}
              onChange={(e) => setEmployeeCode(e.target.value)}
              placeholder="例: 67"
              className="w-full border border-gray-200 rounded px-4 py-3 text-gray-800 placeholder-gray-300 focus:outline-none focus:border-cyan-400 text-lg"
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
              className="w-full border border-gray-200 rounded px-4 py-3 text-gray-800 placeholder-gray-300 focus:outline-none focus:border-cyan-400 text-lg"
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            />
          </div>
          {error && <p className="text-pink-500 text-sm text-center">{error}</p>}
          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full bg-cyan-500 hover:bg-cyan-600 disabled:bg-cyan-300 text-white font-bold py-3.5 rounded text-base shadow-sm transition-all active:scale-95 mt-2"
          >
            {loading ? 'ログイン中...' : 'ログイン'}
          </button>
        </div>
      </div>
      <p className="text-gray-300 text-xs mt-6">© KAT WORLD株式会社</p>
    </div>
  )
}
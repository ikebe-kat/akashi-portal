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
    const code = employeeCode.toUpperCase().trim()
    const { data, error: dbError } = await supabase
      .from('employees')
      .select('id, employee_code, full_name, full_name_kana, department, position, store_id, company_id, pin')
      .eq('employee_code', code)
      .eq('company_id', 'e85e40ac-71f7-4918-b2fc-36d877337b74')
      .maybeSingle()

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

// ───────────────────────────────────────────
// send-push-akashi Edge Function 呼び出し共通ユーティリティ
// Authorization: Bearer <ANON_KEY> を必ず付ける（verify_jwt=true 対策）
// ───────────────────────────────────────────

const FUNCTION_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-push-akashi`;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export async function notifyPush(type: string, payload: Record<string, any>): Promise<void> {
  try {
    const res = await fetch(FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${ANON_KEY}`,
        "apikey": ANON_KEY,
      },
      body: JSON.stringify({ type, payload }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(`[notifyPush] ${type} failed: ${res.status} ${text}`);
    }
  } catch (err) {
    console.warn(`[notifyPush] ${type} error:`, err);
  }
}

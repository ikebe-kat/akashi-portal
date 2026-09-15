"use client";
import { useEffect } from "react";
import { onResume } from "@/lib/onResume";

/**
 * document.activeElement を見て「実データを入力中」かを判定する。
 *
 * 修正意図（誤判定潰し）:
 *  ・空フォーカス（例: 空の検索ボックスにフォーカスだけ乗っている）で reload を
 *    ブロックしないよう、value.length > 0 / textContent 有り 等「実データがある」
 *    ときのみ true を返す。
 *  ・SELECT は「実際に値が入っている（未選択でない）」かを value で判定。
 *  ・ボタン系 input は入力ではないので false。
 *  ・activeElement は初期状態では <body>（bodyは非該当）→ false。
 *
 * これにより「入力していないのに confirm ダイアログが出て reload が止まる」
 * 誤判定が発生しなくなる。実際に破棄されると困る入力があるときだけ確認を挟む。
 */
function isEditingInput(): boolean {
  if (typeof document === "undefined") return false;
  const el = document.activeElement;
  if (!el) return false;

  if (el instanceof HTMLInputElement) {
    const skipTypes = ["button", "submit", "reset", "checkbox", "radio", "hidden", "file"];
    if (skipTypes.includes(el.type)) return false;
    // 空欄なら入力中ではない（空の検索ボックスや空のフォーム欄で誤ブロックしない）
    return el.value.length > 0;
  }
  if (el instanceof HTMLTextAreaElement) {
    return el.value.length > 0;
  }
  if (el instanceof HTMLSelectElement) {
    // 未選択（空文字）ならブロックしない
    return el.value !== "" && el.value != null;
  }
  if ((el as HTMLElement).isContentEditable) {
    const text = (el as HTMLElement).textContent || "";
    return text.trim().length > 0;
  }
  return false;
}

/**
 * Service Worker 登録 + 自動更新機構（/home と /portal から共通利用）。
 *
 * 挙動:
 *  ・マウント時に /sw.js を 1 回だけ登録（通知許可の有無に関わらず登録する）
 *  ・3分ごと / focus 時 / 前面復帰 (onResume) に reg.update() で SW 更新をチェック
 *  ・新 SW が activate（controllerchange イベント）したら自動 reload
 *  ・入力中フォームがある場合は reload 前に confirm ダイアログを挟む
 *   （承認画面や打刻事由入力中の誤爆で入力消失を防ぐ）
 *  ・controllerchange の多重発火は refreshing フラグで防止
 *
 * 前提:
 *  ・sw.js の SW_VERSION がビルド毎に変わる（postbuild スクリプトで保証）
 *  ・sw.js の install/activate で self.skipWaiting() / clients.claim() が呼ばれる
 */
export function useServiceWorkerUpdate(): void {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    // マウント時に SW 登録（通知許可の有無・端末種別に依らず 1 回）。
    // 失敗しても他の処理は続行する。
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.error("[SW] register failed:", err);
    });

    const checkUpdate = () => {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg) reg.update().catch(() => {});
      });
    };

    const onFocus = () => checkUpdate();
    window.addEventListener("focus", onFocus);
    const interval = setInterval(checkUpdate, 3 * 60 * 1000);
    // 前面復帰 (iOS PWA の背景復帰含む) では focus が発火しないケースがあるため、
    // onResume でも update をキックする。前面復帰検知はアプリ全体で lib/onResume.ts に一本化。
    const offResume = onResume(checkUpdate);

    let refreshing = false;
    const onControllerChange = () => {
      if (refreshing) return;

      // 入力中フォームがあれば確認 → 承認画面や事由登録の入力消失を防ぐ
      if (isEditingInput()) {
        const ok = window.confirm(
          "新しいバージョンが利用可能です。\n入力中のデータがある場合は破棄されます。\n今すぐ更新しますか？"
        );
        if (!ok) {
          // ユーザーが「後で」を選択。refreshing はセットせず現行版のまま。
          // 次回アプリを開き直したときに新版が読まれる。
          return;
        }
      }

      refreshing = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    return () => {
      window.removeEventListener("focus", onFocus);
      clearInterval(interval);
      offResume();
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);
}

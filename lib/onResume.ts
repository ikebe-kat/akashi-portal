"use client";

// バックグラウンドから前面に戻ったこと (= visibilityState が "visible" に遷移したこと)
// を検知して 1 引数のコールバックを呼ぶ。visibilitychange を直接触るのは
// アプリ全体でこの 1 関数だけに絞る。それ以外のロジックは持たない。
//
// 戻り値は解除関数。cleanup で必ず呼び出すこと。
export function onResume(cb: () => void): () => void {
  if (typeof document === "undefined") return () => {};
  const handler = () => {
    if (document.visibilityState === "visible") cb();
  };
  document.addEventListener("visibilitychange", handler);
  return () => document.removeEventListener("visibilitychange", handler);
}

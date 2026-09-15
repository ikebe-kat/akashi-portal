"use client";
import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { onResume } from "@/lib/onResume";

type SubEvent = "INSERT" | "UPDATE" | "DELETE" | "*";

export type LiveSubscription = {
  table: string;
  filter?: string;
  event?: SubEvent;
  schema?: string;
};

export type UseLiveListOptions = {
  channel: string;
  subscriptions: LiveSubscription[];
  fetch: () => unknown | Promise<unknown>;
  deps: unknown[];
  enabled?: boolean;
};

// バックグラウンド復帰・Realtime 再接続時に一覧取得を取り直すためのフック。
// アプリ内の全ての Realtime 購読はこのフック 1 本に集約する。
//
// 動作:
//  - マウント時に fetch を 1 回実行
//  - .subscribe() の status コールバックで "SUBSCRIBED" になるたびに fetch
//    （初回接続・バックグラウンド後の再接続の両方でここを通る）
//  - lib/onResume.ts (visibilitychange = visible) で fetch (前面復帰検知はここに一本化)
//  - postgres_changes を受け取ったら fetch
//  - fetch が throw したら即 1 回だけ再試行。それでも失敗したら state は変更せず、
//    次の resume / SUBSCRIBED / postgres_changes で自動的に再試行される（エラー表示は出さない）
//  - 取得は直列化する。走行中に次の trigger が来たら 1 件だけ pending 化し、
//    現在の fetch 完了後に 1 回まとめて再実行する。同時 2 本で古い結果が新しい結果を
//    上書きする事故を避ける。
//  - アンマウント / deps 変更で removeChannel と onResume の解除関数呼び出しを行う。
//    多重購読を防ぐため、subscribe は必ずこの effect の中でのみ行う。
export function useLiveList(opts: UseLiveListOptions) {
  const fetchRef = useRef(opts.fetch);
  fetchRef.current = opts.fetch;

  useEffect(() => {
    if (opts.enabled === false) return;

    let alive = true;
    let running = false;
    let pending = false;

    const runFetch = async () => {
      if (!alive) return;
      if (running) { pending = true; return; }
      running = true;
      pending = false;
      try {
        try {
          await fetchRef.current();
        } catch (err) {
          console.error("[useLiveList] fetch failed:", err);
          if (!alive) return;
          try {
            await fetchRef.current();
          } catch (err2) {
            console.error("[useLiveList] retry failed:", err2);
          }
        }
      } finally {
        running = false;
        if (alive && pending) {
          pending = false;
          runFetch();
        }
      }
    };

    runFetch();

    let ch: ReturnType<typeof supabase.channel> | null = null;
    if (opts.subscriptions.length > 0) {
      ch = supabase.channel(opts.channel);
      for (const sub of opts.subscriptions) {
        ch.on(
          // Supabase realtime の型は "postgres_changes" 文字列リテラルを厳格に要求するため cast
          "postgres_changes" as never,
          {
            event: sub.event ?? "*",
            schema: sub.schema ?? "public",
            table: sub.table,
            ...(sub.filter ? { filter: sub.filter } : {}),
          } as never,
          () => { runFetch(); }
        );
      }
      ch.subscribe((status) => {
        if (status === "SUBSCRIBED") runFetch();
      });
    }

    // 前面復帰検知はアプリ全体で lib/onResume.ts に一本化。
    const offResume = onResume(runFetch);

    return () => {
      alive = false;
      if (ch) supabase.removeChannel(ch);
      offResume();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, opts.deps);
}

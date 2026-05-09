"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { filterAdminPinInput, isValidFourDigitAdminPin } from "../lib/admin-pin";
import type { OwnerEventListItem } from "../lib/owner-types";
import { OWNER_PIN_HEADER } from "../lib/owner-pin-header";

/** ログイン済みPINを保持する localStorage キー */
const LOCAL_STORAGE_OWNER_PIN_KEY = "mission_owner_pin_v1";

function formatJaDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ja-JP", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return "—";
  }
}

export default function OwnerPage() {
  const expectedPin = process.env.NEXT_PUBLIC_OWNER_PIN ?? "";

  const [authChecked, setAuthChecked] = useState(false);
  const [gatePin, setGatePin] = useState("");
  const [gateError, setGateError] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [sessionPin, setSessionPin] = useState<string | null>(null);

  const [events, setEvents] = useState<OwnerEventListItem[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState("");
  const [pwDraft, setPwDraft] = useState<Record<string, string>>({});
  const [pinDraft, setPinDraft] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState("");

  const loadEvents = useCallback(async (pin: string) => {
    setListLoading(true);
    setListError("");
    try {
      const res = await fetch("/api/owner/events", {
        headers: { [OWNER_PIN_HEADER]: pin },
      });
      const data = (await res.json()) as { events?: OwnerEventListItem[]; error?: string };
      if (!res.ok) {
        setListError(data.error ?? "一覧の取得に失敗しました");
        setEvents([]);
        return;
      }
      setEvents(data.events ?? []);
    } catch {
      setListError("一覧の取得に失敗しました");
      setEvents([]);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!expectedPin) {
      setAuthChecked(true);
      return;
    }
    const stored = localStorage.getItem(LOCAL_STORAGE_OWNER_PIN_KEY);
    if (stored && stored === expectedPin) {
      setSessionPin(stored);
      setUnlocked(true);
    }
    setAuthChecked(true);
  }, [expectedPin]);

  useEffect(() => {
    if (!unlocked || !sessionPin) return;
    void loadEvents(sessionPin);
  }, [unlocked, sessionPin, loadEvents]);

  const handleUnlock = () => {
    setGateError("");
    if (!expectedPin) {
      setGateError("環境変数 NEXT_PUBLIC_OWNER_PIN が未設定です");
      return;
    }
    if (gatePin !== expectedPin) {
      setGateError("PINが正しくありません");
      return;
    }
    localStorage.setItem(LOCAL_STORAGE_OWNER_PIN_KEY, gatePin);
    setSessionPin(gatePin);
    setUnlocked(true);
    setGatePin("");
  };

  const handleLogout = () => {
    localStorage.removeItem(LOCAL_STORAGE_OWNER_PIN_KEY);
    setUnlocked(false);
    setSessionPin(null);
    setEvents([]);
    setListError("");
    setActionMessage("");
    setPwDraft({});
    setPinDraft({});
  };

  const authHeaders = useMemo(() => {
    if (!sessionPin) return undefined;
    return { [OWNER_PIN_HEADER]: sessionPin };
  }, [sessionPin]);

  const patchEvent = async (eventId: string, body: Record<string, unknown>) => {
    if (!authHeaders) return;
    setBusyId(eventId);
    setActionMessage("");
    try {
      const res = await fetch(`/api/owner/events/${eventId}`, {
        method: "PATCH",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setActionMessage(data.error ?? "更新に失敗しました");
        return;
      }
      setActionMessage("保存しました");
      if (sessionPin) void loadEvents(sessionPin);
      setPwDraft((d) => ({ ...d, [eventId]: "" }));
      setPinDraft((d) => ({ ...d, [eventId]: "" }));
    } catch {
      setActionMessage("更新に失敗しました");
    } finally {
      setBusyId(null);
    }
  };

  const deleteEvent = async (eventId: string) => {
    if (!authHeaders) return;
    if (!window.confirm("このイベントと関連データを削除します。よろしいですか？")) return;
    setBusyId(eventId);
    setActionMessage("");
    try {
      const res = await fetch(`/api/owner/events/${eventId}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setActionMessage(data.error ?? "削除に失敗しました");
        return;
      }
      setActionMessage("削除しました");
      if (sessionPin) void loadEvents(sessionPin);
    } catch {
      setActionMessage("削除に失敗しました");
    } finally {
      setBusyId(null);
    }
  };

  const submitCredentialUpdate = async (ev: OwnerEventListItem) => {
    const pid = ev.id;
    const joinPassword = pwDraft[pid];
    const adminPinRaw = pinDraft[pid];
    const hasPw = joinPassword !== undefined && joinPassword.trim() !== "";
    const hasPin = adminPinRaw !== undefined && adminPinRaw.trim() !== "";
    if (!hasPw && !hasPin) {
      setActionMessage("参加用パスワードまたは管理用PINのどちらかを入力してください");
      return;
    }
    if (hasPin && !isValidFourDigitAdminPin(adminPinRaw!.trim())) {
      setActionMessage("管理用PINは4桁の数字で入力してください");
      return;
    }
    await patchEvent(pid, {
      action: "updateCredentials",
      ...(hasPw ? { joinPassword: joinPassword!.trim() } : {}),
      ...(hasPin ? { adminPin: adminPinRaw!.trim() } : {}),
    });
  };

  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-4">
        <p className="text-sm text-zinc-400">読み込み中…</p>
      </div>
    );
  }

  if (!expectedPin) {
    return (
      <div className="min-h-screen bg-zinc-950 p-4 text-white">
        <main className="mx-auto max-w-lg pt-12">
          <p className="text-sm font-semibold text-amber-300">
            NEXT_PUBLIC_OWNER_PIN が設定されていません。環境変数を設定してください。
          </p>
        </main>
      </div>
    );
  }

  if (!unlocked) {
    return (
      <div className="min-h-screen bg-zinc-950 p-4 text-white">
        <main className="mx-auto flex max-w-lg flex-col gap-6 pt-16">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Owner</p>
            <h1 className="mt-2 text-2xl font-black">オーナー管理</h1>
            <p className="mt-2 text-sm text-zinc-400">
              PIN を入力してログインしてください。保存されたPINは localStorage にあります。
            </p>
          </div>
          <form
            className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5"
            onSubmit={(e) => {
              e.preventDefault();
              handleUnlock();
            }}
          >
            <label className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-zinc-200">オーナーPIN</span>
              <input
                type="password"
                autoComplete="off"
                value={gatePin}
                onChange={(e) => setGatePin(e.target.value)}
                className="rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-base text-white"
                placeholder="PIN"
                enterKeyHint="done"
              />
            </label>
            {gateError ? <p className="mt-2 text-sm font-semibold text-red-400">{gateError}</p> : null}
            <button
              type="submit"
              className="mt-4 w-full rounded-xl bg-indigo-600 py-3 text-base font-bold text-white active:bg-indigo-700"
            >
              ログイン
            </button>
          </form>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-100 p-4 pb-16">
      <main className="mx-auto flex w-full max-w-lg flex-col gap-6 pt-4">
        <header className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Owner</p>
              <h1 className="text-xl font-black text-zinc-900">オーナー管理</h1>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-bold text-zinc-800 active:bg-zinc-50"
            >
              ログアウト
            </button>
          </div>
          <p className="text-xs leading-relaxed text-zinc-600">
            一覧取得・削除にはサーバー側の Firebase Admin（環境変数 FIREBASE_SERVICE_ACCOUNT_JSON）が必要です。
          </p>
          {listError ? (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">{listError}</p>
          ) : null}
          {actionMessage ? (
            <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900">{actionMessage}</p>
          ) : null}
        </header>

        <section>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-lg font-black text-zinc-900">イベント一覧</h2>
            <button
              type="button"
              disabled={listLoading || !sessionPin}
              onClick={() => sessionPin && void loadEvents(sessionPin)}
              className="rounded-full bg-zinc-800 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
            >
              {listLoading ? "更新中…" : "再読込"}
            </button>
          </div>

          {listLoading && events.length === 0 ? (
            <p className="text-sm text-zinc-600">読み込み中…</p>
          ) : null}

          <div className="flex flex-col gap-4">
            {events.map((ev) => (
              <article
                key={ev.id}
                className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-zinc-100 pb-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="break-words text-base font-black text-zinc-900">{ev.title || "（無題）"}</h3>
                    <p className="mt-1 text-xs text-zinc-600">作成者: {ev.creatorName}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">作成: {formatJaDate(ev.createdAtIso)}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${
                      ev.status === "closed"
                        ? "bg-zinc-200 text-zinc-800"
                        : "bg-emerald-100 text-emerald-900"
                    }`}
                  >
                    {ev.status === "closed" ? "停止中" : "開催中"}
                  </span>
                </div>

                <dl className="mt-3 grid gap-2 text-sm">
                  <div className="flex flex-col gap-1">
                    <dt className="text-zinc-500">参加用パスワード</dt>
                    <dd className="break-all font-mono text-sm font-semibold text-zinc-900">
                      {ev.joinPassword || "（未設定）"}
                    </dd>
                  </div>
                  <div className="flex flex-col gap-1">
                    <dt className="text-zinc-500">管理用PIN</dt>
                    <dd className="font-mono text-base font-bold tracking-widest text-zinc-900">
                      {ev.adminPin || "—"}
                    </dd>
                  </div>
                  <div className="pt-1">
                    <dt className="text-xs text-zinc-500">イベントID</dt>
                    <dd className="break-all font-mono text-xs text-zinc-700">{ev.id}</dd>
                  </div>
                </dl>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busyId === ev.id || ev.status === "closed"}
                    onClick={() => void patchEvent(ev.id, { action: "close" })}
                    className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
                  >
                    イベント停止
                  </button>
                  <button
                    type="button"
                    disabled={busyId === ev.id || ev.status !== "closed"}
                    onClick={() => void patchEvent(ev.id, { action: "reopen" })}
                    className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
                  >
                    イベント再開
                  </button>
                  <button
                    type="button"
                    disabled={busyId === ev.id}
                    onClick={() => void deleteEvent(ev.id)}
                    className="rounded-xl border-2 border-red-300 bg-white px-3 py-2 text-xs font-bold text-red-700 disabled:opacity-40"
                  >
                    イベント削除
                  </button>
                </div>

                <div className="mt-4 rounded-xl bg-zinc-50 p-3">
                  <p className="text-xs font-bold text-zinc-700">認証情報の変更</p>
                  <label className="mt-2 flex flex-col gap-1">
                    <span className="text-xs font-semibold text-zinc-600">参加用パスワード（変更時のみ）</span>
                    <input
                      type="text"
                      value={pwDraft[ev.id] ?? ""}
                      onChange={(e) =>
                        setPwDraft((d) => ({
                          ...d,
                          [ev.id]: e.target.value,
                        }))
                      }
                      className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                      placeholder={ev.joinPassword ? "新しいパスワード" : "設定するパスワード"}
                      autoComplete="off"
                    />
                  </label>
                  <label className="mt-2 flex flex-col gap-1">
                    <span className="text-xs font-semibold text-zinc-600">管理用PIN（変更時のみ・4桁）</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={4}
                      value={pinDraft[ev.id] ?? ""}
                      onChange={(e) =>
                        setPinDraft((d) => ({
                          ...d,
                          [ev.id]: filterAdminPinInput(e.target.value),
                        }))
                      }
                      className="rounded-lg border border-zinc-200 bg-white px-3 py-2 font-mono text-sm tracking-widest"
                      placeholder="••••"
                      autoComplete="off"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={busyId === ev.id}
                    onClick={() => void submitCredentialUpdate(ev)}
                    className="mt-3 w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-bold text-white disabled:opacity-40"
                  >
                    認証情報を保存
                  </button>
                </div>
              </article>
            ))}
          </div>

          {!listLoading && events.length === 0 && !listError ? (
            <p className="mt-4 text-sm text-zinc-600">イベントがありません。</p>
          ) : null}
        </section>
      </main>
    </div>
  );
}

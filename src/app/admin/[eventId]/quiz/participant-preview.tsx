"use client";

import { CheckCircle2, ChevronRight, CircleDot, Clock, Pause } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { NormalizedQuizState } from "../../../lib/quiz-run-state";

type PreviewQuiz = {
  id: string;
  order: number;
  question: string;
  choices: string[];
  correctIndex: number;
  points: number;
  explanation: string;
};

type Props = {
  runStatus: NormalizedQuizState["status"];
  activeQuiz: PreviewQuiz | null;
  secondsLeft: number;
  totalSeconds: number;
};

const CHOICE_LABELS = ["A", "B", "C", "D"];

export function ParticipantPreview({ runStatus, activeQuiz, secondsLeft, totalSeconds }: Props) {
  const [open, setOpen] = useState(false);
  const [selectedPreviewChoice, setSelectedPreviewChoice] = useState<number | null>(null);
  const [showPreviewNotice, setShowPreviewNotice] = useState(false);

  useEffect(() => {
    setSelectedPreviewChoice(null);
    setShowPreviewNotice(false);
  }, [runStatus, activeQuiz?.id]);

  const timeUp = useMemo(() => runStatus === "question" && totalSeconds > 0 && secondsLeft <= 0, [runStatus, totalSeconds, secondsLeft]);

  const renderQuestionPreview = () => {
    if (!activeQuiz) {
      return (
        <div className="rounded-2xl border border-violet-100 bg-white p-6 text-center text-sm text-[#6B7280] shadow-sm">
          読み込み中…
        </div>
      );
    }

    const choiceSelectable = !timeUp;

    return (
      <div className="overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-sm">
        <div className="border-b border-violet-100 bg-gradient-to-r from-violet-50 to-white px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-violet-600">ライブクイズ</p>
              <p className="mt-1 text-[11px] font-semibold text-[#6B7280]">第{activeQuiz.order}問</p>
            </div>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                timeUp ? "bg-red-50 text-red-700 ring-1 ring-red-200" : "bg-violet-100 text-violet-800"
              }`}
            >
              <Clock className="h-3 w-3" strokeWidth={2} aria-hidden />
              {timeUp ? "終了" : `残り ${secondsLeft}s`}
            </span>
          </div>
          <h4 className="mt-2 text-base font-bold leading-snug text-zinc-900">{activeQuiz.question}</h4>
          <p className="mt-1 text-[11px] text-[#6B7280]">正解で +{activeQuiz.points} pt</p>
        </div>

        <div className="space-y-3 p-4">
          {timeUp ? (
            <p className="text-xs font-semibold text-amber-700">時間切れのため回答できません。</p>
          ) : null}

          {activeQuiz.choices.map((label, index) => {
            const selected = selectedPreviewChoice === index;
            return (
              <button
                key={`${activeQuiz.id}-${index}`}
                type="button"
                disabled={!choiceSelectable}
                onClick={() => {
                  // プレビュー用の選択状態だけを保持し、Firestore には保存しません。
                  setSelectedPreviewChoice(index);
                  setShowPreviewNotice(true);
                }}
                className={`flex min-h-[64px] w-full items-center gap-3 rounded-[14px] border px-3 py-3 text-left text-sm font-semibold text-[#111827] transition touch-manipulation ${
                  !choiceSelectable
                    ? "border-zinc-100 bg-zinc-50 text-[#6B7280]"
                    : selected
                      ? "border-[#7C3AED] bg-violet-50 text-[#111827] ring-2 ring-[#7C3AED]/25"
                      : "border-zinc-200 bg-white hover:border-violet-200 hover:bg-violet-50/40"
                }`}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-violet-100 text-xs font-bold text-[#7C3AED]">
                  {CHOICE_LABELS[index] ?? String(index + 1)}
                </span>
                <span className="min-w-0 flex-1">{label}</span>
              </button>
            );
          })}

          <button
            type="button"
            disabled={selectedPreviewChoice === null || timeUp}
            onClick={() => setShowPreviewNotice(true)}
            className="mt-2 flex h-12 w-full items-center justify-center rounded-[14px] bg-[#7C3AED] text-base font-bold text-white shadow-sm disabled:opacity-45 touch-manipulation"
          >
            回答する
          </button>

          {showPreviewNotice ? (
            <p className="rounded-xl bg-violet-50 px-3 py-2 text-center text-xs font-semibold text-[#7C3AED] ring-1 ring-violet-100">
              これはプレビューです。回答は保存されません。
            </p>
          ) : null}
        </div>
      </div>
    );
  };

  const renderAnswerPreview = () => {
    if (!activeQuiz) {
      return (
        <div className="rounded-2xl border border-violet-100 bg-white p-6 text-center text-sm text-[#6B7280] shadow-sm">
          読み込み中…
        </div>
      );
    }

    return (
      <div className="overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-sm">
        <div className="border-b border-violet-100 bg-gradient-to-r from-violet-50 to-white px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-violet-600">答え</p>
              <p className="mt-1 text-[11px] font-semibold text-[#6B7280]">第{activeQuiz.order}問</p>
            </div>
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-bold text-violet-800">答え表示中</span>
          </div>
          <h4 className="mt-2 text-base font-bold leading-snug text-[#111827]">{activeQuiz.question}</h4>
        </div>
        <div className="space-y-2 p-4">
          {activeQuiz.choices.map((label, index) => {
            const isCorrect = index === activeQuiz.correctIndex;
            return (
              <div
                key={`${activeQuiz.id}-answer-${index}`}
                className={`flex min-h-[52px] items-center gap-3 rounded-[14px] border px-3 py-2 text-sm font-semibold ${
                  isCorrect ? "border-emerald-400 bg-emerald-50 text-emerald-900" : "border-zinc-200 bg-zinc-50 text-[#6B7280]"
                }`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-white text-xs font-bold text-[#7C3AED] ring-1 ring-violet-200">
                  {CHOICE_LABELS[index] ?? String(index + 1)}
                </span>
                <span className="min-w-0 flex-1">{label}</span>
                {isCorrect ? <span className="text-xs font-bold text-emerald-700">正解</span> : null}
              </div>
            );
          })}
          {activeQuiz.explanation ? (
            <div className="mt-3 rounded-xl border border-[#E9D5FF] bg-violet-50/50 p-3 text-xs leading-relaxed text-[#111827]">
              <p className="font-bold text-[#7C3AED]">解説</p>
              <p className="mt-1 whitespace-pre-wrap text-[#6B7280]">{activeQuiz.explanation}</p>
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  const renderIdleCard = () => (
    <div className="rounded-2xl border border-violet-100 bg-white p-6 text-center shadow-sm">
      <CircleDot className="mx-auto h-8 w-8 text-violet-400" strokeWidth={1.5} aria-hidden />
      <p className="mt-3 text-sm font-semibold text-[#111827]">現在、出題中のクイズはありません。</p>
      <p className="mt-1 text-xs text-[#6B7280]">運営が出題を開始するまでお待ちください。</p>
    </div>
  );

  const renderPausedCard = () => (
    <div className="rounded-2xl border border-amber-100 bg-amber-50/60 p-6 text-center shadow-sm">
      <Pause className="mx-auto h-8 w-8 text-amber-600" strokeWidth={2} aria-hidden />
      <p className="mt-3 text-sm font-semibold text-[#111827]">現在、一時停止中です。</p>
      <p className="mt-1 text-xs text-[#6B7280]">運営の再開をお待ちください。</p>
    </div>
  );

  const renderFinishedCard = () => (
    <div className="rounded-2xl border border-violet-100 bg-white p-6 text-center shadow-sm">
      <CheckCircle2 className="mx-auto h-8 w-8 text-[#7C3AED]" strokeWidth={2} aria-hidden />
      <p className="mt-3 text-sm font-semibold text-[#111827]">クイズは終了しました。</p>
      <p className="mt-1 text-xs text-[#6B7280]">ご参加ありがとうございました。</p>
    </div>
  );

  const renderPreviewBody = () => {
    if (runStatus === "question") return renderQuestionPreview();
    if (runStatus === "answer") return renderAnswerPreview();
    if (runStatus === "paused") return renderPausedCard();
    if (runStatus === "finished") return renderFinishedCard();
    return renderIdleCard();
  };

  return (
    <section className="rounded-[18px] border border-[#E9D5FF] bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-[#111827]">参加者プレビュー</h3>
          <p className="mt-1 text-xs leading-relaxed text-[#6B7280]">
            参加者画面での見え方を確認できます。ここで選択しても回答には保存されません。
          </p>
        </div>
        <span className="inline-flex rounded-full border border-[#E9D5FF] bg-violet-50 px-3 py-1 text-[11px] font-bold text-[#7C3AED]">
          読み取り専用
        </span>
      </div>

      <div className="mt-4 border-t border-[#E9D5FF] pt-4">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-[14px] border border-[#E9D5FF] bg-white px-4 text-sm font-bold text-[#111827] shadow-sm touch-manipulation"
        >
          <ChevronRight className={`h-4 w-4 text-[#6B7280] transition ${open ? "rotate-90" : ""}`} strokeWidth={2} aria-hidden />
          {open ? "参加者プレビューを閉じる" : "参加者プレビューを表示"}
        </button>
      </div>

      {open ? (
        <div className="mt-4 flex justify-center">
          <div className="w-full max-w-[390px] rounded-[24px] border border-[#E9D5FF] bg-[#FAF5FF] p-4 shadow-[0_16px_36px_rgba(124,58,237,0.10)]">
            <div className="mb-4 flex justify-center">
              <div className="h-1.5 w-24 rounded-full bg-violet-200" />
            </div>
            {renderPreviewBody()}
          </div>
        </div>
      ) : null}
    </section>
  );
}

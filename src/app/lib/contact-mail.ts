/**
 * メール関連の定数と mailto URL 生成。
 * 将来 Firebase Functions / EmailJS 等へ移すときは、ここで組み立てている
 * 件名・本文・送信先をその送信処理の入力型にマッピングしやすいよう分割しています。
 */

export const SUPPORT_EMAIL = "mission.event.app@gmail.com";

function enc(s: string): string {
  return encodeURIComponent(s);
}

/** --- 参加画面: 参加用パスワード忘れ（運営へ） --- */
export const JOIN_PASSWORD_FORGOT_MAIL_SUBJECT = "【イベントチャレンジ】参加用パスワード確認依頼";

export const JOIN_PASSWORD_FORGOT_MAIL_BODY_TEMPLATE = `イベント名：
参加者名：
状況：
返信先メールアドレス：
`;

export function buildJoinPasswordForgotMailtoHref(): string {
  return `mailto:${SUPPORT_EMAIL}?subject=${enc(JOIN_PASSWORD_FORGOT_MAIL_SUBJECT)}&body=${enc(JOIN_PASSWORD_FORGOT_MAIL_BODY_TEMPLATE)}`;
}

/** --- イベント作成画面フッター: 作成前のパスワード忘れ等（運営へ） --- */
export const CREATOR_FOOTER_MAIL_SUBJECT = "【イベントチャレンジ】イベント作成・パスワード忘れ";

export const CREATOR_FOOTER_MAIL_BODY_TEMPLATE = `イベント名：
作成者名：
状況：
`;

export function buildCreatorFooterSupportMailtoHref(): string {
  return `mailto:${SUPPORT_EMAIL}?subject=${enc(CREATOR_FOOTER_MAIL_SUBJECT)}&body=${enc(CREATOR_FOOTER_MAIL_BODY_TEMPLATE)}`;
}

/** --- イベント作成完了: 自分のメールへ情報保存 --- */
export const EVENT_CREATED_SAVE_MAIL_SUBJECT = "【イベントチャレンジ】イベント作成完了";

export type EventCreatedSaveMailParams = {
  eventName: string;
  creatorName: string;
  eventId: string;
  joinPassword: string;
  adminPin: string;
  joinUrl: string;
  adminUrl: string;
};

export function buildEventCreatedSaveMailBody(params: EventCreatedSaveMailParams): string {
  return `イベント作成が完了しました。

イベント名：
${params.eventName}

作成者：
${params.creatorName}

イベントID：
${params.eventId}

参加用パスワード：
${params.joinPassword}

管理用PIN：
${params.adminPin}

参加URL：
${params.joinUrl}

運営URL：
${params.adminUrl}

※ このメールはイベント情報保存用です。
`;
}

export function buildEventCreatedSaveMailtoHref(
  creatorEmail: string,
  params: EventCreatedSaveMailParams,
): string {
  const to = creatorEmail.trim();
  const body = buildEventCreatedSaveMailBody(params);
  return `mailto:${to}?subject=${enc(EVENT_CREATED_SAVE_MAIL_SUBJECT)}&body=${enc(body)}`;
}

function isPlausibleEmail(value: string): boolean {
  const v = value.trim();
  if (v.length < 5) return false;
  const at = v.indexOf("@");
  if (at <= 0 || at === v.length - 1) return false;
  return !/\s/.test(v);
}

export function validateCreatorContactEmail(value: string): boolean {
  return isPlausibleEmail(value);
}

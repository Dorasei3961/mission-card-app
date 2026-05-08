/** パスワード忘れ問い合わせの送信先（運営・サポートのメール）。必要に応じて変更してください。 */
export const PASSWORD_FORGOT_SUPPORT_EMAIL = "example@gmail.com";

export const PASSWORD_FORGOT_MAIL_SUBJECT = "イベントパスワード忘れ";

/** メール本文テンプレート（ユーザーが追記しやすい改行付き） */
export const PASSWORD_FORGOT_MAIL_BODY_TEMPLATE = `イベント名：
作成者名：
状況：
`;

export function buildPasswordForgotMailtoHref(): string {
  const subject = encodeURIComponent(PASSWORD_FORGOT_MAIL_SUBJECT);
  const body = encodeURIComponent(PASSWORD_FORGOT_MAIL_BODY_TEMPLATE);
  return `mailto:${PASSWORD_FORGOT_SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
}

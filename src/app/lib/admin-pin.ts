/** 運営画面用 adminPin は4桁数字のみ */
export const ADMIN_PIN_LENGTH = 4;

export function filterAdminPinInput(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, ADMIN_PIN_LENGTH);
}

export function isValidFourDigitAdminPin(value: string): boolean {
  return /^\d{4}$/.test(value.trim());
}

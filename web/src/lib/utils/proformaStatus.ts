export type ProformaStatus = 'active' | 'expired' | 'cancelled';

export function proformaInvalidMessage(status: ProformaStatus): string | null {
  if (status === 'active') return null;
  if (status === 'cancelled') {
    return 'این نسخه از پیش‌فاکتور باطل شده است و اعتبار ندارد. برای دریافت نسخهٔ معتبر با کارشناسان تماس بگیرید.';
  }
  return 'اعتبار این پیش‌فاکتور به پایان رسیده است. برای قیمت به‌روز با کارشناسان تماس بگیرید.';
}

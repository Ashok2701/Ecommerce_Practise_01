/**
 * Locale-aware formatting. The I18nProvider calls setFormatLocale() whenever the
 * language changes, so every fmt* helper follows the user's language and the
 * client's region and currency (from settings) without callers passing them.
 */
let tag = 'en-IN';
let currency = 'INR';
let fmt = build();

function build() {
  return {
    money: new Intl.NumberFormat(tag, { style: 'currency', currency, maximumFractionDigits: 0 }),
    money2: new Intl.NumberFormat(tag, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    compactMoney: new Intl.NumberFormat(tag, { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }),
    number: new Intl.NumberFormat(tag),
    date: new Intl.DateTimeFormat(tag, { day: '2-digit', month: 'short', year: 'numeric' }),
    dateTime: new Intl.DateTimeFormat(tag, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
    time: new Intl.DateTimeFormat(tag, { hour: '2-digit', minute: '2-digit' }),
    relative: new Intl.RelativeTimeFormat(tag, { numeric: 'auto', style: 'short' }),
  };
}

export function setFormatLocale(language: string, region: string, cur: string) {
  const candidate = region ? `${language}-${region}` : language;
  try { new Intl.NumberFormat(candidate); tag = candidate; } catch { tag = language; }
  currency = cur || currency;
  fmt = build();
}

export const fmtMoney = (n: number, precise = false) => (precise ? fmt.money2 : fmt.money).format(n || 0);
export const fmtCompactMoney = (n: number) => fmt.compactMoney.format(n || 0);
export const fmtNumber = (n: number) => fmt.number.format(n || 0);
export const fmtDate = (d?: string) => (d ? fmt.date.format(new Date(d)) : '—');
export const fmtDateTime = (d?: string) => (d ? fmt.dateTime.format(new Date(d)) : '—');
export const fmtTime = (d?: string) => (d ? fmt.time.format(new Date(d)) : '');

export function timeAgo(d: string) {
  const s = Math.round((new Date(d).getTime() - Date.now()) / 1000);
  const a = Math.abs(s);
  if (a < 60) return fmt.relative.format(0, 'second');
  if (a < 3600) return fmt.relative.format(Math.round(s / 60), 'minute');
  if (a < 86400) return fmt.relative.format(Math.round(s / 3600), 'hour');
  if (a < 86400 * 7) return fmt.relative.format(Math.round(s / 86400), 'day');
  return fmtDate(d);
}

export const initials = (name = '') => name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
export const isSameDay = (a: string, b = new Date().toISOString()) => new Date(a).toDateString() === new Date(b).toDateString();

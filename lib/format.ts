import { appConfig } from './config';

const money = new Intl.NumberFormat(appConfig.locale, { style: 'currency', currency: appConfig.currency, maximumFractionDigits: 0 });
const money2 = new Intl.NumberFormat(appConfig.locale, { style: 'currency', currency: appConfig.currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat(appConfig.locale, { notation: 'compact', maximumFractionDigits: 1 });

export const fmtMoney = (n: number, precise = false) => (precise ? money2 : money).format(n || 0);
export const fmtCompactMoney = (n: number) => '₹' + compact.format(n || 0);
export const fmtNumber = (n: number) => new Intl.NumberFormat(appConfig.locale).format(n || 0);
export const fmtDate = (d?: string) => (d ? new Date(d).toLocaleDateString(appConfig.locale, { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
export const fmtDateTime = (d?: string) => (d ? new Date(d).toLocaleString(appConfig.locale, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
export const fmtTime = (d?: string) => (d ? new Date(d).toLocaleTimeString(appConfig.locale, { hour: '2-digit', minute: '2-digit' }) : '');

export function timeAgo(d: string) {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return fmtDate(d);
}

export const initials = (name = '') => name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
export const isSameDay = (a: string, b = new Date().toISOString()) => new Date(a).toDateString() === new Date(b).toDateString();

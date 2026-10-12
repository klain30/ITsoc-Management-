/**
 * Display formatting only. Money arrives from the API as decimal strings
 * that the server already calculated; the client never does arithmetic on
 * it beyond turning it into a number for Intl formatting.
 */

const LOCALE = 'en-PH';
const TIME_ZONE = 'Asia/Manila';

const peso = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 });
const pesoCompact = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'PHP', notation: 'compact', maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat(LOCALE);

export const formatMoney = (value: string | number | null | undefined) => peso.format(Number(value ?? 0));
export const formatMoneyCompact = (value: string | number | null | undefined) => pesoCompact.format(Number(value ?? 0));
export const formatNumber = (value: number) => integer.format(value);
export const formatPercent = (value: number) => `${value.toLocaleString(LOCALE, { maximumFractionDigits: 1 })}%`;

const dateFmt = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium', timeZone: TIME_ZONE });
const longDateFmt = new Intl.DateTimeFormat(LOCALE, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: TIME_ZONE });
const timeFmt = new Intl.DateTimeFormat(LOCALE, { hour: 'numeric', minute: '2-digit', timeZone: TIME_ZONE });
const dateTimeFmt = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium', timeStyle: 'short', timeZone: TIME_ZONE });
const monthFmt = new Intl.DateTimeFormat(LOCALE, { month: 'short', timeZone: TIME_ZONE });
const dayFmt = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', timeZone: TIME_ZONE });

const toDate = (value: string | Date) => (value instanceof Date ? value : new Date(value));

/** Philippine academic year a date falls in (the year starts in August), e.g. "AY 2026–2027". */
export const academicYear = (value: string | Date) => {
  const date = toDate(value);
  const start = date.getMonth() >= 7 ? date.getFullYear() : date.getFullYear() - 1;
  return `AY ${start}–${start + 1}`;
};

export const formatDate = (value: string | Date | null | undefined) => (value ? dateFmt.format(toDate(value)) : '—');
export const formatLongDate = (value: string | Date) => longDateFmt.format(toDate(value));
export const formatTime = (value: string | Date) => timeFmt.format(toDate(value));
export const formatDateTime = (value: string | Date | null | undefined) => (value ? dateTimeFmt.format(toDate(value)) : '—');
export const monthShort = (value: string | Date) => monthFmt.format(toDate(value));
export const dayOfMonth = (value: string | Date) => dayFmt.format(toDate(value));

/** Date-only strings ("2026-09-29") are calendar dates, not instants. */
export const formatCalendarDate = (value: string) => {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  return new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
};

/** "Mon, Sep 29, 2026 · 1:00 PM – 4:00 PM" (end date shown when different). */
export const formatEventRange = (start: string, end: string) => {
  const sameDay = formatDate(start) === formatDate(end);
  return sameDay
    ? `${formatLongDate(start)} · ${formatTime(start)} – ${formatTime(end)}`
    : `${formatDateTime(start)} – ${formatDateTime(end)}`;
};

const relative = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

export const formatRelative = (value: string | Date) => {
  const seconds = (toDate(value).getTime() - Date.now()) / 1000;
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  }
  return 'just now';
};

export const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

// ─── Form helpers for <input type="datetime-local"> / <input type="date"> ────

const pad = (n: number) => String(n).padStart(2, '0');

/** ISO instant → "YYYY-MM-DDTHH:mm" in the browser's local time. */
export const toLocalInput = (value: string | Date | null | undefined) => {
  if (!value) return '';
  const d = toDate(value);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** "YYYY-MM-DDTHH:mm" (local) → ISO instant. */
export const fromLocalInput = (value: string) => new Date(value).toISOString();

export const todayInput = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Compact year level for tables, e.g. "Y2". */
export const yearLabelShort = (year: number) => `Y${year}`;

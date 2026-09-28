import { describe, expect, it } from 'vitest';

import { formatCalendarDate, formatFileSize, formatMoney, formatPercent, initials, yearLabelShort } from './format';
import { humanizeAction, yearLabel } from './labels';

describe('format', () => {
  it('formats server money strings as pesos without re-computing them', () => {
    expect(formatMoney('32000.00')).toBe('₱32,000.00');
    expect(formatMoney('0.30')).toBe('₱0.30');
    expect(formatMoney(null)).toBe('₱0.00');
  });

  it('treats date-only strings as calendar dates (no timezone shift)', () => {
    expect(formatCalendarDate('2026-09-01')).toBe('Sep 1, 2026');
  });

  it('formats percentages, sizes and initials', () => {
    expect(formatPercent(87.5)).toBe('87.5%');
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(2 * 1024 * 1024)).toBe('2.0 MB');
    expect(initials('Maria  Dela Cruz')).toBe('MD');
    expect(yearLabelShort(3)).toBe('Y3');
  });
});

describe('labels', () => {
  it('humanizes audit actions and year levels', () => {
    expect(humanizeAction('member.created')).toBe('Member created');
    expect(humanizeAction('auth.login_failed')).toBe('Auth login failed');
    expect(yearLabel(1)).toBe('1st year');
    expect(yearLabel(4)).toBe('4th year');
  });
});

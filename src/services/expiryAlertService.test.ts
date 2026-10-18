import { describe, expect, it } from 'vitest';
import { getExpiryAlert } from './expiryAlertService';

describe('getExpiryAlert', () => {
  const today = new Date('2026-10-18T12:00:00');

  it('flags products that expire within 30 days as urgent', () => {
    expect(getExpiryAlert('2026-11-01', today)).toMatchObject({ level: 'urgent', daysRemaining: 14 });
  });

  it('flags products expiring in 31 to 90 days as warning', () => {
    expect(getExpiryAlert('2026-12-01', today)).toMatchObject({ level: 'warning', daysRemaining: 44 });
  });

  it('marks expired products as urgent and says not to sell', () => {
    expect(getExpiryAlert('2026-10-17', today)?.message).toMatch(/no vender/i);
  });

  it('does not alert for products expiring after 90 days', () => {
    expect(getExpiryAlert('2027-02-01', today)).toBeNull();
  });

  it('ignores empty or malformed dates', () => {
    expect(getExpiryAlert('', today)).toBeNull();
    expect(getExpiryAlert('not-a-date', today)).toBeNull();
  });
});

import {
  normalizeServiceMonths,
  normalizeScheduleMode,
  calculateNextServiceDateByMode,
  isElevatorDueThisMonth,
} from '../serviceSchedule';

describe('serviceSchedule utils (mobile)', () => {
  test('normalizeServiceMonths removes duplicates and invalid values', () => {
    expect(normalizeServiceMonths([9, 9, '3', 15, -1, 12])).toEqual([3, 9, 12]);
  });

  test('normalizeScheduleMode fallback is interval', () => {
    expect(normalizeScheduleMode('months')).toBe('months');
    expect(normalizeScheduleMode('x')).toBe('interval');
  });

  test('calculateNextServiceDateByMode month mode picks first next selected month', () => {
    const next = calculateNextServiceDateByMode({
      referenceDate: '2026-04-10T00:00:00.000Z',
      mode: 'months',
      serviceMonths: [6, 12],
    });
    expect(next.getFullYear()).toBe(2026);
    expect(next.getMonth() + 1).toBe(6);
    expect(next.getDate()).toBe(1);
  });

  test('isElevatorDueThisMonth works in month mode', () => {
    const now = new Date('2026-06-15T00:00:00.000Z');
    expect(isElevatorDueThisMonth({ serviceScheduleMode: 'months', serviceMonths: [6, 12] }, now)).toBe(true);
  });
});

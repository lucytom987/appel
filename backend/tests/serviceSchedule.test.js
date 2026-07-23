const {
  normalizeServiceMonths,
  normalizeScheduleMode,
  calculateNextServiceDateByMode,
  isElevatorDueThisMonth,
} = require('../utils/serviceSchedule');

describe('serviceSchedule utils (backend)', () => {
  test('normalizeServiceMonths removes invalid values and sorts unique values', () => {
    expect(normalizeServiceMonths([12, 3, 3, 0, '6', 14, null])).toEqual([3, 6, 12]);
  });

  test('normalizeScheduleMode falls back to interval', () => {
    expect(normalizeScheduleMode('months')).toBe('months');
    expect(normalizeScheduleMode('other')).toBe('interval');
  });

  test('calculateNextServiceDateByMode with interval adds months', () => {
    const next = calculateNextServiceDateByMode({
      referenceDate: '2026-01-15T00:00:00.000Z',
      intervalServisa: 2,
      mode: 'interval',
    });
    expect(next.toISOString().startsWith('2026-03-15')).toBe(true);
  });

  test('calculateNextServiceDateByMode with months picks next configured month', () => {
    const next = calculateNextServiceDateByMode({
      referenceDate: '2026-02-20T00:00:00.000Z',
      mode: 'months',
      serviceMonths: [3, 6, 9, 12],
    });
    expect(next.getFullYear()).toBe(2026);
    expect(next.getMonth() + 1).toBe(3);
    expect(next.getDate()).toBe(1);
  });

  test('calculateNextServiceDateByMode with months rolls over to next year', () => {
    const next = calculateNextServiceDateByMode({
      referenceDate: '2026-12-20T00:00:00.000Z',
      mode: 'months',
      serviceMonths: [3, 6, 9],
    });
    expect(next.getFullYear()).toBe(2027);
    expect(next.getMonth() + 1).toBe(3);
    expect(next.getDate()).toBe(1);
  });

  test('isElevatorDueThisMonth checks month schedule mode', () => {
    const now = new Date('2026-07-10T12:00:00.000Z');
    const due = isElevatorDueThisMonth({
      serviceScheduleMode: 'months',
      serviceMonths: [3, 7, 12],
    }, now);
    expect(due).toBe(true);
  });

  test('isElevatorDueThisMonth checks interval fallback by next service date', () => {
    const now = new Date('2026-07-10T12:00:00.000Z');
    const due = isElevatorDueThisMonth({
      serviceScheduleMode: 'interval',
      sljedeciServis: '2026-07-25T00:00:00.000Z',
      intervalServisa: 2,
    }, now);
    expect(due).toBe(true);
  });
});

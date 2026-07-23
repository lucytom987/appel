const normalizeServiceMonths = (value) => {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .map((month) => Number(month))
    .filter((month) => Number.isInteger(month) && month >= 1 && month <= 12))]
    .sort((a, b) => a - b);
};

const normalizeScheduleMode = (value) => (value === 'months' ? 'months' : 'interval');

const calculateNextServiceDateByMode = ({ referenceDate, intervalServisa = 1, mode = 'interval', serviceMonths = [] }) => {
  if (!referenceDate) return null;

  const baseDate = new Date(referenceDate);
  if (Number.isNaN(baseDate.getTime())) return null;

  const normalizedMode = normalizeScheduleMode(mode);
  if (normalizedMode === 'months') {
    const months = normalizeServiceMonths(serviceMonths);
    if (!months.length) return null;

    for (let yearOffset = 0; yearOffset <= 2; yearOffset += 1) {
      const year = baseDate.getFullYear() + yearOffset;
      for (const month of months) {
        const candidate = new Date(year, month - 1, 1);
        if (candidate > baseDate) return candidate;
      }
    }
    return null;
  }

  const interval = (typeof intervalServisa === 'number' && intervalServisa > 0) ? intervalServisa : 1;
  const nextDate = new Date(baseDate);
  nextDate.setMonth(nextDate.getMonth() + interval);
  return nextDate;
};

const isElevatorDueThisMonth = (elevator, now = new Date()) => {
  if (!elevator) return false;

  const mode = normalizeScheduleMode(elevator.serviceScheduleMode);
  if (mode === 'months') {
    const selectedMonths = normalizeServiceMonths(elevator.serviceMonths);
    return selectedMonths.includes(now.getMonth() + 1);
  }

  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const nextDateRaw = elevator.sljedeciServis;
  const nextDate = nextDateRaw ? new Date(nextDateRaw) : null;
  if (nextDate && !Number.isNaN(nextDate.getTime())) {
    return nextDate <= endOfMonth;
  }

  const lastDateRaw = elevator.zadnjiServis;
  const lastDate = lastDateRaw ? new Date(lastDateRaw) : null;
  if (!lastDate || Number.isNaN(lastDate.getTime())) return false;

  const computed = calculateNextServiceDateByMode({
    referenceDate: lastDate,
    intervalServisa: elevator.intervalServisa,
    mode: 'interval',
    serviceMonths: [],
  });

  return Boolean(computed && computed <= endOfMonth);
};

module.exports = {
  normalizeServiceMonths,
  normalizeScheduleMode,
  calculateNextServiceDateByMode,
  isElevatorDueThisMonth,
};

const definedFields = (value) => Object.fromEntries(
  Object.entries(value || {}).filter(([, fieldValue]) => fieldValue !== undefined)
);

const parseObject = (value) => {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const parseMonths = (value) => {
  let months = value;
  if (typeof value === 'string') {
    try {
      months = JSON.parse(value || '[]');
    } catch {
      months = [];
    }
  }

  if (!Array.isArray(months)) return [];
  return [...new Set(months
    .map((month) => Number(month))
    .filter((month) => Number.isInteger(month) && month >= 1 && month <= 12))]
    .sort((a, b) => a - b);
};

const normalizeAnnualInspection = (value) => {
  if (value === null || value === '') return null;
  if (value === undefined) return undefined;

  if (typeof value === 'number' && Number.isFinite(value)) {
    const month = Math.trunc(value);
    return month >= 1 && month <= 12
      ? new Date(Date.UTC(2000, month - 1, 1)).toISOString()
      : undefined;
  }

  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{1,2}$/.test(raw)) {
    const month = Number(raw);
    return month >= 1 && month <= 12
      ? new Date(Date.UTC(2000, month - 1, 1)).toISOString()
      : undefined;
  }

  const monthYear = raw.match(/^(\d{1,2})[./-]\s*\d{4}$/);
  if (monthYear) {
    const month = Number(monthYear[1]);
    return month >= 1 && month <= 12
      ? new Date(Date.UTC(2000, month - 1, 1)).toISOString()
      : undefined;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
};

export const mergeElevatorUpdate = (existing = {}, update = {}) => {
  const cleanUpdate = definedFields(update);
  const merged = {
    ...existing,
    ...cleanUpdate,
  };

  if (cleanUpdate.kontaktOsoba) {
    merged.kontaktOsoba = {
      ...(existing.kontaktOsoba || {}),
      ...definedFields(cleanUpdate.kontaktOsoba),
    };
  }

  if (cleanUpdate.koordinate) {
    merged.koordinate = {
      ...(existing.koordinate || {}),
      ...definedFields(cleanUpdate.koordinate),
    };
  }

  merged.status = merged.status || 'aktivan';
  merged.is_deleted = merged.is_deleted === true || merged.is_deleted === 1 || merged.is_deleted === '1' ? 1 : 0;
  return merged;
};

export const matchesElevatorListFilter = (elevator, filter) => {
  const isDeleted = elevator?.is_deleted === 1 || elevator?.is_deleted === true || elevator?.is_deleted === '1';
  if (filter === 'obrisano') return isDeleted;
  if (isDeleted) return false;

  const status = elevator?.status || 'aktivan';
  return status === filter;
};

export const buildElevatorSyncPayload = (elevator = {}) => {
  const localId = String(elevator.id || '');
  const coordinates = Array.isArray(elevator.koordinate)
    ? { latitude: elevator.koordinate[0], longitude: elevator.koordinate[1] }
    : elevator.koordinate || {
        latitude: elevator.koordinate_lat,
        longitude: elevator.koordinate_lng,
      };

  return {
    brojUgovora: elevator.brojUgovora,
    nazivStranke: elevator.nazivStranke,
    ulica: elevator.ulica,
    mjesto: elevator.mjesto,
    brojDizala: elevator.brojDizala,
    brojDizalaOpis: elevator.brojDizalaOpis,
    kontaktOsoba: parseObject(elevator.kontaktOsoba),
    koordinate: coordinates,
    status: elevator.status || 'aktivan',
    intervalServisa: elevator.intervalServisa || 1,
    serviceScheduleMode: elevator.serviceScheduleMode || 'interval',
    serviceMonths: parseMonths(elevator.serviceMonths),
    godisnjiPregled: normalizeAnnualInspection(elevator.godisnjiPregled),
    zadnjiServis: elevator.zadnjiServis,
    sljedeciServis: elevator.sljedeciServis,
    napomene: elevator.napomene,
    tip: elevator.tip || elevator.tipObjekta || 'stambeno',
    is_deleted: elevator.is_deleted === true || elevator.is_deleted === 1 || elevator.is_deleted === '1' ? 1 : 0,
    deleted_at: elevator.deleted_at || null,
    clientRequestId: elevator.clientRequestId || (localId.startsWith('local_') ? localId : undefined),
  };
};

export const deserializeElevatorRow = (row = {}) => ({
  ...row,
  kontaktOsoba: parseObject(row.kontaktOsoba),
  serviceScheduleMode: row.serviceScheduleMode || 'interval',
  serviceMonths: parseMonths(row.serviceMonths),
  status: row.status || 'aktivan',
  is_deleted: row.is_deleted === true || row.is_deleted === 1 || row.is_deleted === '1' ? 1 : 0,
  koordinate: {
    latitude: Number.isFinite(Number(row.koordinate_lat)) ? Number(row.koordinate_lat) : 0,
    longitude: Number.isFinite(Number(row.koordinate_lng)) ? Number(row.koordinate_lng) : 0,
  },
});
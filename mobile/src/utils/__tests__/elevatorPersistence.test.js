import {
  buildElevatorSyncPayload,
  deserializeElevatorRow,
  matchesElevatorListFilter,
  mergeElevatorUpdate,
} from '../elevatorPersistence';

describe('elevator persistence', () => {
  test('GPS-only update preserves list visibility fields', () => {
    const existing = {
      id: 'elevator-1',
      nazivStranke: 'Stanoing d.o.o.',
      status: 'aktivan',
      is_deleted: 0,
      koordinate: { latitude: 46.3, longitude: 16.3 },
    };

    expect(mergeElevatorUpdate(existing, {
      koordinate: { latitude: 46.31, longitude: 16.31 },
    })).toEqual({
      ...existing,
      koordinate: { latitude: 46.31, longitude: 16.31 },
    });
  });

  test('explicit status and deletion changes are retained', () => {
    const existing = { status: 'aktivan', is_deleted: 0 };

    expect(mergeElevatorUpdate(existing, {
      status: 'neaktivan',
      is_deleted: 1,
    })).toMatchObject({
      status: 'neaktivan',
      is_deleted: 1,
    });
  });

  test('legacy elevator without status remains visible in active list', () => {
    expect(matchesElevatorListFilter({ is_deleted: 0, status: null }, 'aktivan')).toBe(true);
    expect(matchesElevatorListFilter({ is_deleted: 0, status: 'neaktivan' }, 'aktivan')).toBe(false);
    expect(matchesElevatorListFilter({ is_deleted: 1, status: 'aktivan' }, 'aktivan')).toBe(false);
  });

  test('offline sync preserves every editable elevator field from SQLite', () => {
    const payload = buildElevatorSyncPayload({
      id: 'elevator-1',
      brojUgovora: '',
      nazivStranke: 'Nova stranka',
      ulica: 'Nova 10',
      mjesto: 'Varazdin',
      brojDizala: 'D-10',
      brojDizalaOpis: 'Lijevo',
      tip: 'privreda',
      kontaktOsoba: JSON.stringify({
        imePrezime: 'Ana Anic',
        mobitel: '0911234567',
        email: 'ana@example.com',
        ulaznaKoda: '1111',
        ulazneSifre: ['1111', '2222'],
      }),
      koordinate_lat: 46.305,
      koordinate_lng: 16.336,
      status: 'neaktivan',
      intervalServisa: 3,
      serviceScheduleMode: 'months',
      serviceMonths: '[3,6,6,15]',
      godisnjiPregled: null,
      napomene: '',
      is_deleted: 0,
      deleted_at: null,
      clientRequestId: 'request-1',
    });

    expect(payload).toMatchObject({
      brojUgovora: '',
      nazivStranke: 'Nova stranka',
      ulica: 'Nova 10',
      mjesto: 'Varazdin',
      brojDizala: 'D-10',
      brojDizalaOpis: 'Lijevo',
      tip: 'privreda',
      kontaktOsoba: {
        imePrezime: 'Ana Anic',
        mobitel: '0911234567',
        email: 'ana@example.com',
        ulaznaKoda: '1111',
        ulazneSifre: ['1111', '2222'],
      },
      koordinate: { latitude: 46.305, longitude: 16.336 },
      status: 'neaktivan',
      intervalServisa: 3,
      serviceScheduleMode: 'months',
      serviceMonths: [3, 6],
      godisnjiPregled: null,
      napomene: '',
      is_deleted: 0,
      deleted_at: null,
      clientRequestId: 'request-1',
    });
  });

  test('malformed legacy JSON cannot hide elevators from the list', () => {
    expect(deserializeElevatorRow({
      id: 'legacy-1',
      kontaktOsoba: '{broken',
      serviceMonths: '[broken',
      status: null,
      is_deleted: '0',
      koordinate_lat: '46.30',
      koordinate_lng: '16.33',
    })).toMatchObject({
      id: 'legacy-1',
      kontaktOsoba: {},
      serviceMonths: [],
      status: 'aktivan',
      is_deleted: 0,
      koordinate: { latitude: 46.3, longitude: 16.33 },
    });
  });
});
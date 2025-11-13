// Dummy podaci za testiranje offline-first funkcionalnosti

export const dummyElevators = [
  {
    id: 'dummy_e1',
    brojUgovora: 'UG-001-2024',
    nazivStranke: 'Trg bana Jelačića d.o.o.',
    ulica: 'Trg bana Jelačića 10',
    mjesto: 'Zagreb',
    brojDizala: '1',
    kontaktOsoba: {
      imePrezime: 'Marko Horvat',
      mobitel: '+385 1 1234 5678',
      email: 'marko@trg.hr',
      ulaznaKoda: '1234'
    },
    koordinate: {
      latitude: 45.813,
      longitude: 15.977
    },
    status: 'aktivan',
    intervalServisa: 1,
    zadnjiServis: '2024-10-20',
    sljedeciServis: '2024-11-20',
    napomene: 'Redovito održavanje svakih mjesec dana'
  },
  {
    id: 'dummy_e2',
    brojUgovora: 'UG-002-2024',
    nazivStranke: 'Savska cesta d.o.o.',
    ulica: 'Savska cesta 25',
    mjesto: 'Zagreb',
    brojDizala: '2',
    kontaktOsoba: {
      imePrezime: 'Petar Nikolić',
      mobitel: '+385 1 9876 5432',
      email: 'petar@savska.hr',
      ulaznaKoda: '5678'
    },
    koordinate: {
      latitude: 45.804,
      longitude: 15.966
    },
    status: 'u kvaru',
    intervalServisa: 1,
    zadnjiServis: '2024-11-05',
    sljedeciServis: '2024-12-05',
    napomene: 'Kvar na kontrolnoj ploči - čeka zamjena'
  },
  {
    id: 'dummy_e3',
    brojUgovora: 'UG-003-2024',
    nazivStranke: 'Ilica d.o.o.',
    ulica: 'Ilica 142',
    mjesto: 'Zagreb',
    brojDizala: '1',
    kontaktOsoba: {
      imePrezime: 'Ana Marić',
      mobitel: '+385 1 5555 1111',
      email: 'ana@ilica.hr',
      ulaznaKoda: '9999'
    },
    koordinate: {
      latitude: 45.814,
      longitude: 15.955
    },
    status: 'u servisu',
    intervalServisa: 1,
    zadnjiServis: '2024-11-10',
    sljedeciServis: '2024-12-10',
    napomene: 'Planirano održavanje do kraja tjedna'
  },
];

export const dummyServices = [
  {
    id: 'dummy_s1',
    elevatorId: 'dummy_e1',
    serviserID: 'dummy_user_1',
    datum: '2024-10-20',
    checklist: [
      { stavka: 'engine_check', provjereno: 1, napomena: '' },
      { stavka: 'cable_inspection', provjereno: 1, napomena: '' },
      { stavka: 'door_system', provjereno: 1, napomena: '' },
      { stavka: 'emergency_brake', provjereno: 1, napomena: '' }
    ],
    imaNedostataka: 0,
    nedostaci: [],
    napomene: 'Sve u redu, redoviti servis',
    synced: 1,
  },
  {
    id: 'dummy_s2',
    elevatorId: 'dummy_e2',
    serviserID: 'dummy_user_1',
    datum: '2024-11-05',
    checklist: [
      { stavka: 'engine_check', provjereno: 1, napomena: '' },
      { stavka: 'cable_inspection', provjereno: 0, napomena: 'Ponos nije radio' },
      { stavka: 'door_system', provjereno: 1, napomena: '' },
      { stavka: 'emergency_brake', provjereno: 1, napomena: '' }
    ],
    imaNedostataka: 1,
    nedostaci: [{ opis: 'Problem sa kontrolnom pločom - potrebna zamjena', ispravljen: 0 }],
    napomene: 'Prijavljen kvar',
    synced: 1,
  },
];

export const dummyRepairs = [
  {
    id: 'dummy_r1',
    elevatorId: 'dummy_e2',
    serviserID: null,
    datumPrijave: '2024-11-05',
    datumPopravka: null,
    opisKvara: 'Kontrolna ploča ne reagira - dizalo stoji',
    opisPopravka: null,
    status: 'čekanje',
    radniNalogPotpisan: 0,
    popravkaUPotpunosti: 0,
    napomene: 'Čeka narudžbu rezervnog dijela',
    synced: 1,
  },
];

// Funkcija za punjenje baze dummy podacima
export const seedDummyData = (elevatorDB, serviceDB, repairDB) => {
  try {
    // Dodaj dizala
    dummyElevators.forEach(elevator => {
      elevatorDB.insert(elevator);
    });
    
    // Dodaj servise
    dummyServices.forEach(service => {
      serviceDB.insert(service);
    });
    
    // Dodaj popravke
    dummyRepairs.forEach(repair => {
      repairDB.insert(repair);
    });
    
    console.log('✅ Dummy podaci dodani u bazu');
    return true;
  } catch (error) {
    console.error('❌ Greška pri dodavanju dummy podataka:', error);
    return false;
  }
};

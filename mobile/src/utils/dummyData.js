// Dummy podaci za testiranje offline-first funkcionalnosti

export const dummyElevators = [
  {
    id: 'dummy_e1',
    address: 'Trg bana Jelačića 10, Zagreb',
    buildingCode: 'TRG-001',
    location_lat: 45.813,
    location_lng: 15.977,
    manufacturer: 'Schindler',
    model: '3300',
    serialNumber: 'SCH-2023-001',
    installationDate: '2023-01-15',
    lastServiceDate: '2024-10-20',
    status: 'active',
    notes: 'Redovito održavanje svakih 30 dana',
  },
  {
    id: 'dummy_e2',
    address: 'Savska cesta 25, Zagreb',
    buildingCode: 'SAV-025',
    location_lat: 45.804,
    location_lng: 15.966,
    manufacturer: 'Otis',
    model: 'Gen2',
    serialNumber: 'OTS-2022-045',
    installationDate: '2022-06-10',
    lastServiceDate: '2024-11-05',
    status: 'out_of_order',
    notes: 'Kvar na kontrolnoj ploči - čeka zamjena',
  },
  {
    id: 'dummy_e3',
    address: 'Ilica 142, Zagreb',
    buildingCode: 'ILI-142',
    location_lat: 45.814,
    location_lng: 15.955,
    manufacturer: 'KONE',
    model: 'MonoSpace',
    serialNumber: 'KON-2021-089',
    installationDate: '2021-03-20',
    lastServiceDate: '2024-11-10',
    status: 'maintenance',
    notes: 'Planirano održavanje do kraja tjedna',
  },
];

export const dummyServices = [
  {
    id: 'dummy_s1',
    elevatorId: 'dummy_e1',
    performedBy: 'admin',
    serviceDate: '2024-10-20',
    status: 'completed',
    checklistUPS: 1,
    checklistVoice: 1,
    checklistShaft: 1,
    checklistGuides: 1,
    defectsFound: 0,
    defectsDescription: null,
    defectsPhotos: '[]',
    notes: 'Sve u redu, redoviti servis',
    synced: 1,
  },
  {
    id: 'dummy_s2',
    elevatorId: 'dummy_e2',
    performedBy: 'admin',
    serviceDate: '2024-11-05',
    status: 'completed',
    checklistUPS: 1,
    checklistVoice: 0,
    checklistShaft: 1,
    checklistGuides: 1,
    defectsFound: 1,
    defectsDescription: 'Problem sa kontrolnom pločom - potrebna zamjena',
    defectsPhotos: '[]',
    notes: 'Prijavljen kvar',
    synced: 1,
  },
];

export const dummyRepairs = [
  {
    id: 'dummy_r1',
    elevatorId: 'dummy_e2',
    reportedBy: 'admin',
    reportedDate: '2024-11-05',
    repairedBy: null,
    repairedDate: null,
    status: 'pending',
    priority: 'urgent',
    faultDescription: 'Kontrolna ploča ne reagira - dizalo stoji',
    faultPhotos: '[]',
    repairDescription: null,
    workOrderSigned: 0,
    repairCompleted: 0,
    notes: 'Čeka narudžbu rezervnog dijela',
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

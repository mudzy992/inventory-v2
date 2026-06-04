import { v4 as uuidv4 } from 'uuid';
import { equipmentMatchesScope } from './helpers/registrar-scope';
import type { AppState, OrgUnit, Employee, Category, Equipment, TransferRecord, CategoryField, UserAccount, Notification, SavedFilter, UserRole } from './types';

const ORG_IDS = {
  direkcija: uuidv4(),
  sektorFinansija: uuidv4(),
  sluzbaRacunovodstva: uuidv4(),
  sektorIT: uuidv4(),
  sluzbaInfrastrukture: uuidv4(),
  sluzbaRazvoja: uuidv4(),
  sektorPravni: uuidv4(),
  distribucijaSarajevo: uuidv4(),
  sektorTehDistSa: uuidv4(),
  sluzbaMrezaDistSa: uuidv4(),
  podruznicaCentar: uuidv4(),
  sluzbaPodrCentar: uuidv4(),
  podruznicaNovoSarajevo: uuidv4(),
  sluzbaPodrNS: uuidv4(),
  podrucjeSnabdijevanja: uuidv4(),
  sektorNabavke: uuidv4(),
};

const EMP_IDS = {
  genDirektor: uuidv4(),
  dirDistribucija: uuidv4(),
  dirSnabdijevanje: uuidv4(),
  sefFinansija: uuidv4(),
  radnikFin1: uuidv4(),
  sefIT: uuidv4(),
  radnikIT1: uuidv4(),
  radnikIT2: uuidv4(),
  sefInfra: uuidv4(),
  sefRazvoj: uuidv4(),
  dirDistSa: uuidv4(),
  tehDirDistSa: uuidv4(),
  sefMrezaDistSa: uuidv4(),
  rukovPodrCentar: uuidv4(),
  radnikPodrCentar1: uuidv4(),
  rukovPodrNS: uuidv4(),
  radnikPodrNS1: uuidv4(),
  sefNabavke: uuidv4(),
  radnikNabavke1: uuidv4(),
  sefPravni: uuidv4(),
};

// Parent category IDs
const PARENT_CAT_IDS = {
  racunarskaOprema: uuidv4(),
  kancelarijaOprema: uuidv4(),
  komunikacijskaOprema: uuidv4(),
};

// Sub-category IDs
const CAT_IDS = {
  radnaStanica: uuidv4(),
  monitor: uuidv4(),
  laptop: uuidv4(),
  printer: uuidv4(),
  skener: uuidv4(),
  mobitel: uuidv4(),
  tablet: uuidv4(),
};

function createDemoData(): AppState {
  // ============ ORG UNITS ============
  const orgUnits: OrgUnit[] = [
    { id: ORG_IDS.direkcija, name: 'Direkcija Društva', type: 'direkcija', parentId: null, signerId: EMP_IDS.genDirektor },
    { id: ORG_IDS.sektorFinansija, name: 'Sektor za finansije', type: 'sektor', parentId: ORG_IDS.direkcija },
    { id: ORG_IDS.sluzbaRacunovodstva, name: 'Služba računovodstva', type: 'sluzba', parentId: ORG_IDS.sektorFinansija },
    { id: ORG_IDS.sektorIT, name: 'Sektor za IT', type: 'sektor', parentId: ORG_IDS.direkcija },
    { id: ORG_IDS.sluzbaInfrastrukture, name: 'Služba za infrastrukturu', type: 'sluzba', parentId: ORG_IDS.sektorIT },
    { id: ORG_IDS.sluzbaRazvoja, name: 'Služba za razvoj', type: 'sluzba', parentId: ORG_IDS.sektorIT },
    { id: ORG_IDS.sektorPravni, name: 'Sektor pravnih poslova', type: 'sektor', parentId: ORG_IDS.direkcija },
    { id: ORG_IDS.distribucijaSarajevo, name: 'Distribucija Sarajevo', type: 'distribucija', parentId: ORG_IDS.direkcija, signerId: EMP_IDS.dirDistSa },
    { id: ORG_IDS.sektorTehDistSa, name: 'Sektor tehničkih poslova', type: 'sektor', parentId: ORG_IDS.distribucijaSarajevo },
    { id: ORG_IDS.sluzbaMrezaDistSa, name: 'Služba za mreže', type: 'sluzba', parentId: ORG_IDS.sektorTehDistSa },
    { id: ORG_IDS.podruznicaCentar, name: 'Podružnica Centar', type: 'podruznica', parentId: ORG_IDS.distribucijaSarajevo, signerId: EMP_IDS.rukovPodrCentar },
    { id: ORG_IDS.sluzbaPodrCentar, name: 'Služba korisničkih poslova', type: 'sluzba', parentId: ORG_IDS.podruznicaCentar },
    { id: ORG_IDS.podruznicaNovoSarajevo, name: 'Podružnica Novo Sarajevo', type: 'podruznica', parentId: ORG_IDS.distribucijaSarajevo, signerId: EMP_IDS.rukovPodrNS },
    { id: ORG_IDS.sluzbaPodrNS, name: 'Služba korisničkih poslova NS', type: 'sluzba', parentId: ORG_IDS.podruznicaNovoSarajevo },
    { id: ORG_IDS.podrucjeSnabdijevanja, name: 'Područje snabdijevanja', type: 'podrucje', parentId: ORG_IDS.direkcija, signerId: EMP_IDS.dirSnabdijevanje },
    { id: ORG_IDS.sektorNabavke, name: 'Sektor nabavke', type: 'sektor', parentId: ORG_IDS.podrucjeSnabdijevanja },
  ];

  // ============ EMPLOYEES ============
  const employees: Employee[] = [
    { id: EMP_IDS.genDirektor, firstName: 'Emir', lastName: 'Hadžić', title: 'Generalni direktor', orgUnitId: ORG_IDS.direkcija, email: 'emir.hadzic@firma.ba' },
    { id: EMP_IDS.dirDistribucija, firstName: 'Alen', lastName: 'Begović', title: 'Direktor za distribuciju', orgUnitId: ORG_IDS.direkcija, email: 'alen.begovic@firma.ba' },
    { id: EMP_IDS.dirSnabdijevanje, firstName: 'Samir', lastName: 'Kovačević', title: 'Direktor za snabdijevanje', orgUnitId: ORG_IDS.podrucjeSnabdijevanja, email: 'samir.kovacevic@firma.ba' },
    { id: EMP_IDS.sefFinansija, firstName: 'Amra', lastName: 'Delić', title: 'Rukovodilac sektora', orgUnitId: ORG_IDS.sektorFinansija, email: 'amra.delic@firma.ba' },
    { id: EMP_IDS.radnikFin1, firstName: 'Lamija', lastName: 'Mujić', title: 'Stručni saradnik', orgUnitId: ORG_IDS.sluzbaRacunovodstva, email: 'lamija.mujic@firma.ba' },
    { id: EMP_IDS.sefIT, firstName: 'Adnan', lastName: 'Sarajlić', title: 'Rukovodilac sektora za IT', orgUnitId: ORG_IDS.sektorIT, email: 'adnan.sarajlic@firma.ba' },
    { id: EMP_IDS.radnikIT1, firstName: 'Kenan', lastName: 'Hodžić', title: 'Sistem administrator', orgUnitId: ORG_IDS.sluzbaInfrastrukture, email: 'kenan.hodzic@firma.ba' },
    { id: EMP_IDS.radnikIT2, firstName: 'Dženan', lastName: 'Halilović', title: 'Razvojni inženjer', orgUnitId: ORG_IDS.sluzbaRazvoja, email: 'dzenan.halilovic@firma.ba' },
    { id: EMP_IDS.sefInfra, firstName: 'Mirza', lastName: 'Bašić', title: 'Rukovodilac službe za infrastrukturu', orgUnitId: ORG_IDS.sluzbaInfrastrukture, email: 'mirza.basic@firma.ba' },
    { id: EMP_IDS.sefRazvoj, firstName: 'Nermin', lastName: 'Čaušević', title: 'Rukovodilac službe za razvoj', orgUnitId: ORG_IDS.sluzbaRazvoja, email: 'nermin.causevic@firma.ba' },
    { id: EMP_IDS.dirDistSa, firstName: 'Jasmin', lastName: 'Mehmedović', title: 'Direktor distribucije', orgUnitId: ORG_IDS.distribucijaSarajevo, email: 'jasmin.mehmedovic@firma.ba' },
    { id: EMP_IDS.tehDirDistSa, firstName: 'Nedim', lastName: 'Hasanović', title: 'Tehnički direktor', orgUnitId: ORG_IDS.distribucijaSarajevo, email: 'nedim.hasanovic@firma.ba' },
    { id: EMP_IDS.sefMrezaDistSa, firstName: 'Amir', lastName: 'Omerović', title: 'Rukovodilac službe za mreže', orgUnitId: ORG_IDS.sluzbaMrezaDistSa, email: 'amir.omerovic@firma.ba' },
    { id: EMP_IDS.rukovPodrCentar, firstName: 'Haris', lastName: 'Handžić', title: 'Rukovodilac poslovnice', orgUnitId: ORG_IDS.podruznicaCentar, email: 'haris.handzic@firma.ba' },
    { id: EMP_IDS.radnikPodrCentar1, firstName: 'Edina', lastName: 'Spahić', title: 'Referent', orgUnitId: ORG_IDS.sluzbaPodrCentar, email: 'edina.spahic@firma.ba' },
    { id: EMP_IDS.rukovPodrNS, firstName: 'Faruk', lastName: 'Tanović', title: 'Rukovodilac poslovnice', orgUnitId: ORG_IDS.podruznicaNovoSarajevo, email: 'faruk.tanovic@firma.ba' },
    { id: EMP_IDS.radnikPodrNS1, firstName: 'Lejla', lastName: 'Salčić', title: 'Referent', orgUnitId: ORG_IDS.sluzbaPodrNS, email: 'lejla.salcic@firma.ba' },
    { id: EMP_IDS.sefNabavke, firstName: 'Tarik', lastName: 'Imamović', title: 'Rukovodilac sektora nabavke', orgUnitId: ORG_IDS.sektorNabavke, email: 'tarik.imamovic@firma.ba' },
    { id: EMP_IDS.radnikNabavke1, firstName: 'Amina', lastName: 'Čengić', title: 'Stručni saradnik za nabavku', orgUnitId: ORG_IDS.sektorNabavke, email: 'amina.cengic@firma.ba' },
    { id: EMP_IDS.sefPravni, firstName: 'Vedad', lastName: 'Karić', title: 'Rukovodilac sektora pravnih poslova', orgUnitId: ORG_IDS.sektorPravni, email: 'vedad.karic@firma.ba' },
  ];

  // ============ USER ACCOUNTS ============
  const users: UserAccount[] = [
    // System Admin
    { id: uuidv4(), employeeId: EMP_IDS.sefIT, username: 'admin', password: 'admin123', role: 'admin', isActive: true },
    
    // Evidenticar - manages IT sector (infrastructure + development)
    { 
      id: uuidv4(), 
      employeeId: EMP_IDS.radnikIT1, 
      username: 'kenan.hodzic', 
      password: 'user123', 
      role: 'evidenticar', 
      isActive: true,
      registrarScopes: [],
    },
    
    // Evidenticar - manages Distribucija Sarajevo
    { 
      id: uuidv4(), 
      employeeId: EMP_IDS.tehDirDistSa, 
      username: 'nedim.hasanovic', 
      password: 'user123', 
      role: 'evidenticar', 
      isActive: true,
      registrarScopes: [],
    },
    
    // Regular users
    ...employees
      .filter(emp => ![EMP_IDS.sefIT, EMP_IDS.radnikIT1, EMP_IDS.tehDirDistSa].includes(emp.id))
      .map(emp => ({
        id: uuidv4(),
        employeeId: emp.id,
        username: emp.email?.split('@')[0] || `${emp.firstName.toLowerCase()}.${emp.lastName.toLowerCase()}`,
        password: 'user123',
        role: 'user' as const,
        isActive: true,
      })),
  ];

  // ============ CATEGORIES (with hierarchy) ============
  const fieldSerijskiBroj: CategoryField = { id: 'sn', name: 'Serijski broj', type: 'text', required: true, unique: true };
  const fieldProizvodjac: CategoryField = { id: 'mfr', name: 'Proizvođač', type: 'text', required: true, unique: false };
  const fieldModel: CategoryField = { id: 'model', name: 'Model', type: 'text', required: true, unique: false };
  
  const categories: Category[] = [
    // Parent Categories (no fields, just grouping)
    {
      id: PARENT_CAT_IDS.racunarskaOprema,
      name: 'Računarska oprema',
      description: 'Računari, monitori, laptopi i periferni uređaji',
      parentId: null,
      fields: [],
      optionalFields: [],
    },
    {
      id: PARENT_CAT_IDS.kancelarijaOprema,
      name: 'Kancelarijska oprema',
      description: 'Štampači, skeneri i ostala kancelarijska oprema',
      parentId: null,
      fields: [],
      optionalFields: [],
    },
    {
      id: PARENT_CAT_IDS.komunikacijskaOprema,
      name: 'Komunikacijska oprema',
      description: 'Mobilni telefoni, tableti i komunikacijski uređaji',
      parentId: null,
      fields: [],
      optionalFields: [],
    },
    
    // Sub-Categories
    {
      id: CAT_IDS.radnaStanica,
      name: 'Radna stanica (Desktop PC)',
      description: 'Desktop računari - radne stanice',
      parentId: PARENT_CAT_IDS.racunarskaOprema,
      fields: [
        { ...fieldSerijskiBroj, id: 'rs-sn' },
        { ...fieldProizvodjac, id: 'rs-mfr' },
        { ...fieldModel, id: 'rs-model' },
        { id: 'rs-cpu', name: 'Procesor', type: 'text', required: true, unique: false },
        { id: 'rs-ram', name: 'RAM (GB)', type: 'number', required: true, unique: false },
        { id: 'rs-hdd', name: 'Disk (GB)', type: 'number', required: true, unique: false },
        { id: 'rs-os', name: 'Operativni sistem', type: 'select', required: false, unique: false, options: ['Windows 10', 'Windows 11', 'Linux', 'Bez OS'] },
      ],
      optionalFields: [
        { id: 'rs-gpu', name: 'Grafička kartica', type: 'text', required: false, unique: false },
        { id: 'rs-mac', name: 'MAC adresa', type: 'text', required: false, unique: true },
      ],
    },
    {
      id: CAT_IDS.monitor,
      name: 'Monitor',
      description: 'Monitori - ekrani',
      parentId: PARENT_CAT_IDS.racunarskaOprema,
      fields: [
        { ...fieldSerijskiBroj, id: 'mon-sn' },
        { ...fieldProizvodjac, id: 'mon-mfr' },
        { ...fieldModel, id: 'mon-model' },
        { id: 'mon-size', name: 'Dijagonala (inch)', type: 'number', required: true, unique: false },
        { id: 'mon-res', name: 'Rezolucija', type: 'select', required: true, unique: false, options: ['1920x1080', '2560x1440', '3840x2160'] },
      ],
      optionalFields: [
        { id: 'mon-panel', name: 'Tip panela', type: 'select', required: false, unique: false, options: ['IPS', 'VA', 'TN', 'OLED'] },
      ],
    },
    {
      id: CAT_IDS.laptop,
      name: 'Laptop',
      description: 'Prijenosni računari',
      parentId: PARENT_CAT_IDS.racunarskaOprema,
      fields: [
        { ...fieldSerijskiBroj, id: 'lap-sn' },
        { ...fieldProizvodjac, id: 'lap-mfr' },
        { ...fieldModel, id: 'lap-model' },
        { id: 'lap-cpu', name: 'Procesor', type: 'text', required: true, unique: false },
        { id: 'lap-ram', name: 'RAM (GB)', type: 'number', required: true, unique: false },
        { id: 'lap-hdd', name: 'Disk (GB)', type: 'number', required: true, unique: false },
        { id: 'lap-screen', name: 'Dijagonala ekrana (inch)', type: 'number', required: true, unique: false },
      ],
      optionalFields: [
        { id: 'lap-os', name: 'Operativni sistem', type: 'select', required: false, unique: false, options: ['Windows 10', 'Windows 11', 'Linux', 'macOS'] },
        { id: 'lap-mac', name: 'MAC adresa', type: 'text', required: false, unique: true },
      ],
    },
    {
      id: CAT_IDS.printer,
      name: 'Printer',
      description: 'Štampači i multifunkcionalni uređaji',
      parentId: PARENT_CAT_IDS.kancelarijaOprema,
      fields: [
        { ...fieldSerijskiBroj, id: 'prt-sn' },
        { ...fieldProizvodjac, id: 'prt-mfr' },
        { ...fieldModel, id: 'prt-model' },
        { id: 'prt-type', name: 'Tip', type: 'select', required: true, unique: false, options: ['Laserski', 'Inkjet', 'Multifunkcionalni', 'Termalni'] },
      ],
      optionalFields: [
        { id: 'prt-color', name: 'Kolor štampa', type: 'select', required: false, unique: false, options: ['Da', 'Ne'] },
        { id: 'prt-ip', name: 'IP adresa', type: 'text', required: false, unique: true },
      ],
    },
    {
      id: CAT_IDS.skener,
      name: 'Skener',
      description: 'Skeneri dokumenata',
      parentId: PARENT_CAT_IDS.kancelarijaOprema,
      fields: [
        { ...fieldSerijskiBroj, id: 'scn-sn' },
        { ...fieldProizvodjac, id: 'scn-mfr' },
        { ...fieldModel, id: 'scn-model' },
        { id: 'scn-type', name: 'Tip', type: 'select', required: true, unique: false, options: ['Flatbed', 'Document feeder', 'Portable'] },
      ],
      optionalFields: [
        { id: 'scn-res', name: 'Rezolucija (DPI)', type: 'number', required: false, unique: false },
      ],
    },
    {
      id: CAT_IDS.mobitel,
      name: 'Mobilni telefon',
      description: 'Mobilni telefoni',
      parentId: PARENT_CAT_IDS.komunikacijskaOprema,
      fields: [
        { id: 'mob-imei', name: 'IMEI', type: 'text', required: true, unique: true },
        { ...fieldProizvodjac, id: 'mob-mfr' },
        { ...fieldModel, id: 'mob-model' },
        { id: 'mob-tel', name: 'Telefonski broj', type: 'text', required: false, unique: true },
      ],
      optionalFields: [
        { id: 'mob-os', name: 'Operativni sistem', type: 'select', required: false, unique: false, options: ['Android', 'iOS'] },
        { id: 'mob-storage', name: 'Memorija (GB)', type: 'number', required: false, unique: false },
      ],
    },
    {
      id: CAT_IDS.tablet,
      name: 'Tablet',
      description: 'Tablet uređaji',
      parentId: PARENT_CAT_IDS.komunikacijskaOprema,
      fields: [
        { ...fieldSerijskiBroj, id: 'tab-sn' },
        { ...fieldProizvodjac, id: 'tab-mfr' },
        { ...fieldModel, id: 'tab-model' },
        { id: 'tab-screen', name: 'Dijagonala (inch)', type: 'number', required: true, unique: false },
      ],
      optionalFields: [
        { id: 'tab-os', name: 'Operativni sistem', type: 'select', required: false, unique: false, options: ['Android', 'iOS', 'Windows'] },
        { id: 'tab-storage', name: 'Memorija (GB)', type: 'number', required: false, unique: false },
      ],
    },
  ];

  // ============ EQUIPMENT ============
  const equipment: Equipment[] = [];
  
  for (let i = 1; i <= 20; i++) {
    equipment.push({
      id: uuidv4(),
      categoryId: CAT_IDS.radnaStanica,
      inventoryNumber: `INV-RS-2024-${String(i).padStart(4, '0')}`,
      specifications: {
        'rs-sn': `SN-HP-${100000 + i}`,
        'rs-mfr': i % 2 === 0 ? 'HP' : 'Dell',
        'rs-model': i % 2 === 0 ? 'ProDesk 400 G7' : 'OptiPlex 7090',
        'rs-cpu': i % 3 === 0 ? 'Intel Core i7-10700' : 'Intel Core i5-10500',
        'rs-ram': i % 4 === 0 ? '32' : '16',
        'rs-hdd': i % 2 === 0 ? '512' : '256',
        'rs-os': 'Windows 11',
      },
      status: i <= 12 ? 'zaduzeno' : 'skladiste',
      contractNumber: 'UG-2024-001',
      entryDate: '2024-01-15',
      currentHolderId: i <= 12 ? Object.values(EMP_IDS)[i - 1] : undefined,
    });
  }

  for (let i = 1; i <= 20; i++) {
    equipment.push({
      id: uuidv4(),
      categoryId: CAT_IDS.monitor,
      inventoryNumber: `INV-MON-2024-${String(i).padStart(4, '0')}`,
      specifications: {
        'mon-sn': `SN-DELL-${200000 + i}`,
        'mon-mfr': i % 2 === 0 ? 'Dell' : 'LG',
        'mon-model': i % 2 === 0 ? 'P2422H' : '24MK430H',
        'mon-size': i % 3 === 0 ? '27' : '24',
        'mon-res': i % 4 === 0 ? '2560x1440' : '1920x1080',
      },
      status: i <= 12 ? 'zaduzeno' : 'skladiste',
      contractNumber: 'UG-2024-001',
      entryDate: '2024-01-15',
      currentHolderId: i <= 12 ? Object.values(EMP_IDS)[i - 1] : undefined,
    });
  }

  for (let i = 1; i <= 5; i++) {
    equipment.push({
      id: uuidv4(),
      categoryId: CAT_IDS.laptop,
      inventoryNumber: `INV-LAP-2024-${String(i).padStart(4, '0')}`,
      specifications: {
        'lap-sn': `SN-LENOVO-${300000 + i}`,
        'lap-mfr': 'Lenovo',
        'lap-model': 'ThinkPad T14',
        'lap-cpu': 'Intel Core i7-1165G7',
        'lap-ram': '16',
        'lap-hdd': '512',
        'lap-screen': '14',
      },
      status: i <= 3 ? 'zaduzeno' : 'skladiste',
      contractNumber: 'UG-2024-002',
      entryDate: '2024-03-01',
      currentHolderId: i <= 3 ? [EMP_IDS.genDirektor, EMP_IDS.dirDistribucija, EMP_IDS.dirSnabdijevanje][i - 1] : undefined,
    });
  }

  // Add some printers
  for (let i = 1; i <= 5; i++) {
    equipment.push({
      id: uuidv4(),
      categoryId: CAT_IDS.printer,
      inventoryNumber: `INV-PRT-2024-${String(i).padStart(4, '0')}`,
      specifications: {
        'prt-sn': `SN-HP-PRT-${400000 + i}`,
        'prt-mfr': 'HP',
        'prt-model': i % 2 === 0 ? 'LaserJet Pro M404dn' : 'OfficeJet Pro 9015',
        'prt-type': i % 2 === 0 ? 'Laserski' : 'Inkjet',
      },
      status: 'skladiste',
      contractNumber: 'UG-2024-003',
      entryDate: '2024-04-01',
    });
  }

  // Add some mobile phones
  for (let i = 1; i <= 5; i++) {
    equipment.push({
      id: uuidv4(),
      categoryId: CAT_IDS.mobitel,
      inventoryNumber: `INV-MOB-2024-${String(i).padStart(4, '0')}`,
      specifications: {
        'mob-imei': `35${String(100000000000 + i)}`,
        'mob-mfr': i % 2 === 0 ? 'Samsung' : 'Apple',
        'mob-model': i % 2 === 0 ? 'Galaxy S23' : 'iPhone 14',
        'mob-tel': `+387 61 ${100 + i} ${200 + i}`,
      },
      status: i <= 3 ? 'zaduzeno' : 'skladiste',
      contractNumber: 'UG-2024-004',
      entryDate: '2024-05-01',
      currentHolderId: i <= 3 ? [EMP_IDS.genDirektor, EMP_IDS.dirDistribucija, EMP_IDS.dirSnabdijevanje][i - 1] : undefined,
    });
  }

  equipment.push({
    id: uuidv4(),
    categoryId: CAT_IDS.radnaStanica,
    inventoryNumber: 'INV-RS-2023-0001',
    specifications: {
      'rs-sn': 'SN-HP-OLD-001',
      'rs-mfr': 'HP',
      'rs-model': 'ProDesk 400 G5',
      'rs-cpu': 'Intel Core i3-8100',
      'rs-ram': '8',
      'rs-hdd': '256',
      'rs-os': 'Windows 10',
    },
    status: 'rashodovano',
    contractNumber: 'UG-2023-001',
    entryDate: '2023-01-10',
    notes: 'Oštećena matična ploča - neisplativ popravak',
  });

  // ============ TRANSFERS ============
  const transfers: TransferRecord[] = [];
  
  for (let i = 0; i < 12; i++) {
    const emp = Object.values(EMP_IDS)[i];
    const empData = employees.find(e => e.id === emp);
    if (!empData) continue;
    
    let signerId = EMP_IDS.genDirektor;
    const empOrgUnit = orgUnits.find(o => o.id === empData.orgUnitId);
    if (empOrgUnit) {
      let current: OrgUnit | undefined = empOrgUnit;
      while (current) {
        if (current.signerId) {
          signerId = current.signerId;
          break;
        }
        current = orgUnits.find(o => o.id === current!.parentId);
      }
    }

    transfers.push({
      id: uuidv4(),
      equipmentId: equipment[i].id,
      type: 'zaduzenje',
      fromType: 'skladiste',
      toType: 'osoba',
      toPersonId: emp,
      signerId,
      date: '2024-02-01',
      status: 'potpisan',
      documentNumber: `PRN-2024-${String(i * 2 + 1).padStart(4, '0')}`,
      notes: 'Zaduženje po kolaudaciji',
    });

    transfers.push({
      id: uuidv4(),
      equipmentId: equipment[20 + i].id,
      type: 'zaduzenje',
      fromType: 'skladiste',
      toType: 'osoba',
      toPersonId: emp,
      signerId,
      date: '2024-02-01',
      status: 'potpisan',
      documentNumber: `PRN-2024-${String(i * 2 + 2).padStart(4, '0')}`,
      notes: 'Zaduženje po kolaudaciji',
    });
  }

  transfers.push({
    id: uuidv4(),
    equipmentId: equipment[equipment.length - 1].id,
    type: 'rashodovanje',
    fromType: 'skladiste',
    toType: 'rashod',
    signerId: EMP_IDS.genDirektor,
    date: '2024-06-15',
    status: 'potpisan',
    documentNumber: 'PRN-2024-RASH-0001',
    reason: 'Oštećena matična ploča - neisplativ popravak',
  });

  // ============ NOTIFICATIONS ============
  const notifications: Notification[] = [];
  
  // ============ SAVED FILTERS ============
  const savedFilters: SavedFilter[] = [];

  return {
    cantons: [],
    cities: [],
    warehouses: [],
    orgUnits,
    employees,
    categories,
    equipment,
    transfers,
    users,
    notifications,
    savedFilters,
    currentUserId: null,
  };
}

import type { AuthUserDto } from './api/auth-api';

const emptyAppState = (): AppState => ({
  cantons: [],
  cities: [],
  warehouses: [],
  orgUnits: [],
  employees: [],
  categories: [],
  equipment: [],
  transfers: [],
  users: [],
  notifications: [],
  savedFilters: [],
  currentUserId: null,
});

let _state: AppState = emptyAppState();
let _authUser: AuthUserDto | null = null;
const _listeners: Set<() => void> = new Set();

export function syncAppState(state: AppState): void {
  _state = state;
  _listeners.forEach((listener) => listener());
}

export function setAuthUser(user: AuthUserDto | null): void {
  _authUser = user;
  _listeners.forEach((listener) => listener());
}

export function getState(): AppState {
  return _state;
}

/** @deprecated Prefer API mutations + refresh() from useData() */
export function setState(updater: (prev: AppState) => AppState): void {
  _state = updater(_state);
  _listeners.forEach((listener) => listener());
}

export function subscribe(listener: () => void): () => void {
  _listeners.add(listener);
  return () => {
    _listeners.delete(listener);
  };
}

export function getNextDocumentNumber(): string {
  const year = new Date().getFullYear();
  const thisYearTransfers = _state.transfers.filter(
    (transfer) =>
      transfer.documentNumber.includes(String(year)) &&
      !transfer.documentNumber.includes('RASH') &&
      !transfer.documentNumber.startsWith('DRAFT'),
  );
  return `PRN-${year}-${String(thisYearTransfers.length + 1).padStart(4, '0')}`;
}

export function getCurrentUser(): UserAccount | null {
  if (!_authUser) {
    return null;
  }
  const existing = _state.users.find((user) => user.id === _authUser?.id);
  if (existing) {
    return existing;
  }
  return {
    id: _authUser.id,
    username: _authUser.username,
    role: _authUser.role,
    employeeId: _authUser.employeeId ?? '',
    password: '',
    isActive: true,
    registrarScopes: _authUser.registrarScopes,
  };
}

export function getCurrentEmployee(): Employee | null {
  const user = getCurrentUser();
  if (!user) return null;
  return _state.employees.find(e => e.id === user.employeeId) || null;
}

export function isAdmin(): boolean {
  const user = getCurrentUser();
  return user?.role === 'admin';
}

export function isEvidenticar(): boolean {
  const user = getCurrentUser();
  return user?.role === 'evidenticar';
}

export function isSkladistar(): boolean {
  const user = getCurrentUser();
  return user?.role === 'skladistar';
}

export function getUserRole(): UserRole | null {
  const user = getCurrentUser();
  return user?.role || null;
}

export {
  equipmentMatchesScope,
  employeeMatchesScope,
  isEmployeeInManagedUnits,
  transferMatchesScope,
  isCrossRegistrarScopeTransfer,
} from './helpers/registrar-scope';

export function getRegistrarScopes() {
  return getCurrentUser()?.registrarScopes ?? [];
}

// Check if transfer is cross-service (different org units at service level)
export function isCrossServiceTransfer(fromEmployeeId: string | undefined, toEmployeeId: string | undefined): boolean {
  if (!fromEmployeeId || !toEmployeeId) return false;
  
  const fromEmp = _state.employees.find(e => e.id === fromEmployeeId);
  const toEmp = _state.employees.find(e => e.id === toEmployeeId);
  
  if (!fromEmp || !toEmp) return false;
  
  // Check if they're in the same service chain
  function getServiceChain(orgUnitId: string): string[] {
    const chain: string[] = [];
    let current = _state.orgUnits.find(o => o.id === orgUnitId);
    while (current) {
      chain.unshift(current.id);
      current = _state.orgUnits.find(o => o.id === current!.parentId);
    }
    return chain;
  }
  
  const fromChain = getServiceChain(fromEmp.orgUnitId);
  const toChain = getServiceChain(toEmp.orgUnitId);
  
  // If they share a common path at service/sektor level, not cross-service
  // Otherwise, it's cross-service
  const fromService = _state.orgUnits.find(o => o.id === fromEmp.orgUnitId);
  const toService = _state.orgUnits.find(o => o.id === toEmp.orgUnitId);
  
  if (!fromService || !toService) return true;
  
  // Same org unit = not cross-service
  if (fromEmp.orgUnitId === toEmp.orgUnitId) return false;
  
  // Check if one is ancestor of other
  if (fromChain.includes(toEmp.orgUnitId) || toChain.includes(fromEmp.orgUnitId)) return false;
  
  // Check if they share common parent at sektor level or below
  for (let i = 0; i < Math.min(fromChain.length, toChain.length); i++) {
    if (fromChain[i] !== toChain[i]) {
      // They diverge - check at what level
      const divergePoint = i > 0 ? _state.orgUnits.find(o => o.id === fromChain[i - 1]) : null;
      if (divergePoint) {
        // If diverge at sektor level or higher, it's cross-service for evidenticar
        const types = ['sektor', 'sluzba', 'odjeljenje'];
        if (types.includes(divergePoint.type)) {
          return false; // Same branch
        }
      }
      return true;
    }
  }
  
  return false;
}

// Notification helpers (synced via REST + Socket.IO)
export function applyNotificationsLoaded(notifications: Notification[]): void {
  setState((prev) => ({ ...prev, notifications }));
}

export function applyNotificationCreated(notification: Notification): void {
  setState((prev) => {
    if (prev.notifications.some((row) => row.id === notification.id)) {
      return prev;
    }
    return { ...prev, notifications: [notification, ...prev.notifications] };
  });
}

export function applyNotificationRead(notificationId: string): void {
  setState((prev) => ({
    ...prev,
    notifications: prev.notifications.map((row) =>
      row.id === notificationId ? { ...row, read: true } : row,
    ),
  }));
}

/** @deprecated Use API + SocketProvider instead */
export function addNotification(userId: string, type: Notification['type'], title: string, message: string, relatedId?: string): void {
  const notification: Notification = {
    id: uuidv4(),
    userId,
    type,
    title,
    message,
    read: false,
    createdAt: new Date().toISOString(),
    relatedId,
  };
  applyNotificationCreated(notification);
}

/** @deprecated Use markNotificationReadApi + SocketProvider */
export function markNotificationRead(notificationId: string): void {
  applyNotificationRead(notificationId);
}

export function getUnreadNotificationsCount(userId: string): number {
  return _state.notifications.filter(n => n.userId === userId && !n.read).length;
}

// Category helpers
export function getParentCategories(): typeof _state.categories {
  return _state.categories.filter(c => c.parentId === null);
}

export function getSubCategories(parentId: string): typeof _state.categories {
  return _state.categories.filter(c => c.parentId === parentId);
}

export function getCategoryWithParent(categoryId: string): { category: typeof _state.categories[0] | null, parent: typeof _state.categories[0] | null } {
  const category = _state.categories.find(c => c.id === categoryId) || null;
  const parent = category?.parentId ? _state.categories.find(c => c.id === category.parentId) || null : null;
  return { category, parent };
}

// Equipment stats helper
export function getEquipmentStats(categoryId?: string, useRegistrarScope = false) {
  let filtered = _state.equipment;
  const user = getCurrentUser();
  if (categoryId) {
    const subCats = getSubCategories(categoryId);
    if (subCats.length > 0) {
      const subCatIds = subCats.map((c) => c.id);
      filtered = filtered.filter((e) => subCatIds.includes(e.categoryId));
    } else {
      filtered = filtered.filter((e) => e.categoryId === categoryId);
    }
  }
  if (useRegistrarScope && user?.role === 'evidenticar') {
    filtered = filtered.filter((e) => equipmentMatchesScope(e, _state, user));
  }
  
  const total = filtered.length;
  const skladiste = filtered.filter(e => e.status === 'skladiste').length;
  const zaduzeno = filtered.filter(e => e.status === 'zaduzeno').length;
  const rashodovano = filtered.filter(e => e.status === 'rashodovano').length;
  
  // Get transfer stats
  const equipIds = filtered.map(e => e.id);
  const relatedTransfers = _state.transfers.filter(t => equipIds.includes(t.equipmentId));
  const rawTransfers = relatedTransfers.filter(t => t.status === 'raw').length;
  const signedTransfers = relatedTransfers.filter(t => t.status === 'potpisan').length;
  
  return { total, skladiste, zaduzeno, rashodovano, rawTransfers, signedTransfers };
}

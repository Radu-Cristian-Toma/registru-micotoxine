// Limite implicite conform Reg. (UE) 2023/915, Anexa I, pct. 1.1.12 si 1.2.10
// (cereale/produse derivate destinate consumatorului final), versiunea
// consolidata 02023R0915-20250101 (integreaza toate amendamentele pana la
// M8/Reg. 2024/1808 inclusiv). Folosite DOAR ca fallback cand categoria
// probei nu se potriveste niciunui profil din RULE_PROFILES mai jos - in
// acel caz (mod exploratoriu), se aplica valorile pentru consumatorul
// final (mai stricte), nu cele pentru materia prima neprocesata.
//
// ATENTIE PRIVIND RIGOAREA: aceste valori si intregul RULE_PROFILES de mai
// jos NU sunt garantate sa ramana valabile la nesfarsit - Reg. 2023/915
// este amendat periodic (DON prin 2024/1022, OTA/ZEA/FUM prin 2024/1756,
// T-2/HT-2 prin 2024/1038, ergot prin 2024/1808 etc.). Inainte de folosirea
// platformei in productie reala pentru decizii de conformitate, aceste
// limite trebuie re-verificate direct pe versiunea consolidata curenta de
// pe EUR-Lex (https://eur-lex.europa.eu/eli/reg/2023/915), nu doar preluate
// din acest fisier ca sursa finala. Metodele de esantionare si analiza
// (greutate proba, LOQ, esantion de control pozitiv) sunt reglementate
// separat prin Reg. de punere in aplicare (UE) 2023/2782, care NU
// stabileste limite numerice, ci modul de prelevare/analiza - relevant
// pentru campurile "Metoda analitica" si probele de control din aplicatie.
const DEFAULT_LIMITS = {
  limit_afb1: 2.0,
  limit_afla_sum: 4.0,
  limit_ota: 3.0
};

// Profiluri bazate pe limitele UE relevante, per categorie de produs.
// Sursele cu "(actualizat prin Reg. X)" reflecta amendamentul care a
// stabilit valoarea CURENTA citata aici, nu textul initial din 2023/915.
// Nu inlocuiesc verificarea incadrarii exacte a produsului si a versiunii
// legislatiei active la momentul folosirii - vezi nota de mai sus.
const RULE_PROFILES = [
  {
    id: 'cereals-final-consumer',
    label: 'Cereale / produse derivate pentru consumatorul final',
    keywords: ['cereale', 'grâu', 'grau', 'orz', 'ovăz', 'ovaz', 'secară', 'secara', 'făină', 'farina'],
    limit_afb1: 2.0, limit_afla_sum: 4.0, limit_ota: 3.0,
    limit_don: 750, limit_zea: 75, limit_fum: null,
    source: 'Reg. (UE) 2023/915, Anexa I: AFB1/sumă pct. 1.1.12 (text inițial); OTA pct. 1.2.10 (actualizat prin Reg. 2024/1756); DON pct. 1.4.4 (actualizat prin Reg. 2024/1022); ZEA pct. 1.5.3 (actualizat prin Reg. 2024/1756)'
  },
  {
    id: 'unprocessed-cereals',
    label: 'Cereale neprocesate pentru prima etapă de procesare',
    keywords: ['cereale neprocesate', 'boabe neprocesate'],
    limit_afb1: 2.0, limit_afla_sum: 4.0, limit_ota: 5.0,
    limit_don: 1000, limit_zea: 100, limit_fum: null,
    source: 'Reg. (UE) 2023/915, Anexa I: AFB1/sumă pct. 1.1.12 (text inițial); OTA pct. 1.2.9 (actualizat prin Reg. 2024/1756); DON pct. 1.4.1 (actualizat prin Reg. 2024/1022); ZEA pct. 1.5.1 (actualizat prin Reg. 2024/1756)'
  },
  {
    id: 'maize-final-consumer',
    label: 'Porumb și produse derivate pentru consumatorul final',
    keywords: ['porumb'],
    limit_afb1: 2.0, limit_afla_sum: 4.0, limit_ota: 3.0,
    limit_don: 750, limit_zea: 100, limit_fum: 1000,
    source: 'Reg. (UE) 2023/915, Anexa I: AFB1/sumă pct. 1.1.12 (text inițial); OTA pct. 1.2.10 (actualizat prin Reg. 2024/1756); DON pct. 1.4.4 (actualizat prin Reg. 2024/1022); ZEA pct. 1.5.5 (text inițial, neschimbat); FUM pct. 1.6.2 (text inițial, neschimbat)'
  },
  {
    id: 'maize-unprocessed',
    label: 'Porumb neprocesat pentru prima etapă de procesare',
    keywords: ['porumb neprocesat'],
    limit_afb1: 2.0, limit_afla_sum: 4.0, limit_ota: 5.0,
    limit_don: 1500, limit_zea: 350, limit_fum: 4000,
    source: 'Reg. (UE) 2023/915, Anexa I: AFB1/sumă pct. 1.1.12, OTA pct. 1.2.9 (actualizat prin Reg. 2024/1756); DON pct. 1.4.2 (actualizat prin Reg. 2024/1022 — 1500 µg/kg, nu 1750, care e valoarea pt. ovăz neprocesat, pct. 1.4.3); ZEA pct. 1.5.2, FUM pct. 1.6.1 (ambele actualizate prin Reg. 2024/1756)'
  },
  {
    id: 'maize-rice-sorting',
    label: 'Porumb sau orez destinat sortării / tratamentului fizic',
    keywords: ['porumb sortare', 'orez sortare', 'porumb tratament fizic', 'orez tratament fizic'],
    limit_afb1: 5.0, limit_afla_sum: 10.0, limit_ota: 5.0,
    limit_don: null, limit_zea: null, limit_fum: null,
    source: 'Regulamentul (UE) 2023/915, Anexa I, pct. 1.1.13 și 1.2.9'
  },
  {
    id: 'rice-final-consumer',
    label: 'Orez și produse derivate pentru consumatorul final',
    keywords: ['orez'],
    limit_afb1: 2.0, limit_afla_sum: 4.0, limit_ota: 3.0,
    limit_don: null, limit_zea: null, limit_fum: null,
    source: 'Regulamentul (UE) 2023/915, Anexa I, pct. 1.1.12 și 1.2.10 (orezul e exclus de la limitele DON/ZEA/FUM)'
  },
  {
    id: 'dried-fruit-final',
    label: 'Fructe uscate pentru consumatorul final (exclusiv smochine)',
    keywords: ['fructe uscate', 'stafide', 'curmale uscate', 'prune uscate', 'caise uscate'],
    limit_afb1: 2.0, limit_afla_sum: 4.0, limit_ota: 2.0,
    // aflatoxine (1.1.x) și OTA (1.2.x) verificate de Hermes 17.10.2026 pe EUR-Lex consolidat; de reconfirmat de laborator pe textul oficial
    source: 'Regulamentul (UE) 2023/915, Anexa I, pct. 1.1.2 și 1.2.1.2'
  },
  {
    id: 'dried-fruit-sorting',
    label: 'Fructe uscate înainte de sortare / alt tratament fizic',
    keywords: ['fructe uscate sortare', 'fructe uscate tratament fizic'],
    limit_afb1: 5.0, limit_afla_sum: 10.0, limit_ota: 2.0,
    // aflatoxine (1.1.x) și OTA (1.2.x) verificate de Hermes 17.10.2026 pe EUR-Lex consolidat; de reconfirmat de laborator pe textul oficial
    source: 'Regulamentul (UE) 2023/915, Anexa I, pct. 1.1.1 și 1.2.1.2'
  },
  {
    id: 'dried-figs-final',
    label: 'Smochine uscate pentru consumatorul final',
    keywords: ['smochine uscate', 'smochine'],
    limit_afb1: 6.0, limit_afla_sum: 10.0, limit_ota: 8.0,
    source: 'Regulamentul (UE) 2023/915, Anexa I, pct. 1.1.3 și 1.2.1.1'
  },
  {
    id: 'peanuts-oilseeds-final',
    label: 'Arahide și alte semințe oleaginoase pentru consumatorul final',
    keywords: ['arahide', 'semințe oleaginoase', 'seminte oleaginoase', 'floarea soarelui', 'rapiță', 'rapita', 'soia'],
    limit_afb1: 2.0, limit_afla_sum: 4.0, limit_ota: null,
    // verificat de Hermes 17.10.2026; de reconfirmat de laborator pe textul oficial
    source: 'Regulamentul (UE) 2023/915, Anexa I, pct. 1.1.5'
  },
  {
    id: 'peanuts-oilseeds-sorting',
    label: 'Arahide și semințe oleaginoase înainte de sortare',
    keywords: ['arahide sortare', 'arahide tratament fizic'],
    limit_afb1: 8.0, limit_afla_sum: 15.0, limit_ota: null,
    // verificat de Hermes 17.10.2026; de reconfirmat de laborator pe textul oficial
    source: 'Regulamentul (UE) 2023/915, Anexa I, pct. 1.1.4'
  },
  {
    id: 'tree-nuts-final',
    label: 'Fructe cu coajă lemnoasă pentru consumatorul final (exclusiv migdale/fistic/caise/alune de pădure/nuci de Brazilia)',
    keywords: ['nuci', 'alune', 'fructe cu coajă', 'fructe cu coaja'],
    limit_afb1: 2.0, limit_afla_sum: 4.0, limit_ota: null,
    // verificat de Hermes 17.10.2026; de reconfirmat de laborator pe textul oficial
    source: 'Regulamentul (UE) 2023/915, Anexa I, pct. 1.1.7'
  },
  {
    id: 'tree-nuts-sorting',
    label: 'Fructe cu coajă lemnoasă înainte de sortare',
    keywords: ['nuci sortare', 'alune sortare', 'fructe cu coajă sortare'],
    limit_afb1: 5.0, limit_afla_sum: 10.0, limit_ota: null,
    // verificat de Hermes 17.10.2026; de reconfirmat de laborator pe textul oficial
    source: 'Regulamentul (UE) 2023/915, Anexa I, pct. 1.1.6'
  },
  {
    id: 'almonds-pistachios-apricot-sorting',
    label: 'Migdale, fistic, sâmburi de caise înainte de sortare / tratament fizic',
    keywords: ['migdale sortare', 'fistic sortare', 'sâmburi caise sortare', 'samburi caise sortare'],
    limit_afb1: 12.0, limit_afla_sum: 15.0, limit_ota: null,
    source: 'Regulamentul (UE) 2023/915, Anexa I, pct. 1.1.8'
  },
  {
    id: 'almonds-pistachios-apricot-final',
    label: 'Migdale, fistic, sâmburi de caise pentru consumatorul final',
    keywords: ['migdale', 'fistic', 'sâmburi caise', 'samburi caise'],
    limit_afb1: 8.0, limit_afla_sum: 10.0, limit_ota: null,
    source: 'Regulamentul (UE) 2023/915, Anexa I, pct. 1.1.9'
  },
  {
    id: 'hazelnuts-brazil-sorting',
    label: 'Alune de pădure și nuci de Brazilia înainte de sortare / tratament fizic',
    keywords: ['alune de pădure sortare', 'alune de padure sortare', 'nuci de brazilia sortare'],
    limit_afb1: 8.0, limit_afla_sum: 15.0, limit_ota: null,
    source: 'Regulamentul (UE) 2023/915, Anexa I, pct. 1.1.10'
  },
  {
    id: 'hazelnuts-brazil-final',
    label: 'Alune de pădure și nuci de Brazilia pentru consumatorul final',
    keywords: ['alune de pădure', 'alune de padure', 'nuci de brazilia'],
    limit_afb1: 5.0, limit_afla_sum: 10.0, limit_ota: null,
    source: 'Regulamentul (UE) 2023/915, Anexa I, pct. 1.1.11'
  },
  {
    id: 'capsicum-dried',
    label: 'Capsicum spp. uscat (boia, paprika, ardei iute, chilli, cayenne)',
    keywords: ['boia', 'paprika', 'ardei iute', 'chilli', 'cayenne'],
    limit_afb1: 5.0, limit_afla_sum: 10.0, limit_ota: 20.0,
    // aflatoxine (1.1.x) și OTA (1.2.x) verificate de Hermes 17.10.2026 pe EUR-Lex consolidat; de reconfirmat de laborator pe textul oficial
    // (limita OTA de 20 µg/kg pentru Capsicum este confirmata si de Reg. (UE) 2022/1370)
    source: 'Regulamentul (UE) 2023/915, Anexa I, pct. 1.1.14 și 1.2.18'
  },
  {
    id: 'spices-dried',
    label: 'Mirodenii uscate',
    keywords: ['mirodenii', 'condimente', 'piper', 'ghimbir', 'nucșoară', 'nucsoara', 'curcuma', 'turmeric'],
    limit_afb1: 5.0, limit_afla_sum: 10.0, limit_ota: 15.0,
    // aflatoxine (1.1.x) și OTA (1.2.x) verificate de Hermes 17.10.2026 pe EUR-Lex consolidat; de reconfirmat de laborator pe textul oficial
    source: 'Regulamentul (UE) 2023/915, Anexa I, pct. 1.1.14 și 1.2.17'
  },
  {
    id: 'roasted-coffee',
    label: 'Cafea prăjită (boabe și măcinată)',
    keywords: ['cafea', 'cafea prăjită', 'cafea prajita', 'cafea măcinată', 'cafea macinata'],
    limit_afb1: null, limit_afla_sum: null, limit_ota: 3.0,
    // verificat de Hermes 17.10.2026; de reconfirmat de laborator pe textul oficial
    source: 'Regulamentul (UE) 2023/915, Anexa I, pct. 1.2.14'
  },
  {
    id: 'wine',
    label: 'Vin și alte băuturi pe bază de must de struguri',
    keywords: ['vin', 'must de struguri', 'must struguri'],
    limit_afb1: null, limit_afla_sum: null, limit_ota: 2.0,
    // verificat de Hermes 17.10.2026; de reconfirmat de laborator pe textul oficial
    source: 'Regulamentul (UE) 2023/915, Anexa I, pct. 1.2.20'
  },
  {
    id: 'raw-milk',
    label: 'Lapte crud, lapte tratat termic și lapte pentru produse lactate',
    keywords: ['lapte crud', 'lapte', 'lapte tratat termic'],
    limit_afb1: null, limit_afla_sum: null, limit_ota: null, limit_m1: 0.050,
    // verificat de Hermes 17.10.2026; de reconfirmat de laborator pe textul oficial
    source: 'Regulamentul (UE) 2023/915, Anexa I, pct. 1.1.16 (aflatoxina M1)'
  },
  // ---- Etapa B (revizia 2 a auditului, L23/L24): profiluri adaugate dupa confruntarea cu Anexa I
  // a Reg. (UE) 2023/915, versiunea consolidata 02023R0915-20250101. Verificat 21.10.2026 prin
  // citirea paginii EUR-Lex (rezumat automat) - de reconfirmat de laborator pe textul oficial.
  // Aceste profiluri sunt atinse prin eticheta exacta sau prin rafinarea din REFINEMENTS (mai jos).
  {
    id: 'cereal-milling-products',
    label: 'Produse de măcinare a cerealelor (făină, griș) pentru consumatorul final',
    keywords: [],
    limit_afb1: 2.0, limit_afla_sum: 4.0, limit_ota: 3.0,
    limit_don: 600, limit_zea: 75, limit_fum: null,
    source: 'Reg. (UE) 2023/915, Anexa I: AFB1/sumă pct. 1.1.12; OTA pct. 1.2.10; DON pct. 1.4.5 (produse de măcinare a cerealelor, exclusiv porumb și orez); ZEA pct. 1.5.3 (inclusiv făină și griș)'
  },
  {
    id: 'dried-vine-fruit-final',
    label: 'Fructe de vită-de-vie uscate pentru consumatorul final (stafide, coarințe, sultanine)',
    keywords: [],
    limit_afb1: 2.0, limit_afla_sum: 4.0, limit_ota: 8.0,
    source: 'Reg. (UE) 2023/915, Anexa I, pct. 1.1.2 și 1.2.1.1 (fructe de vită-de-vie uscate: coarințe, stafide, sultanine)'
  },
  {
    id: 'dried-vine-fruit-sorting',
    label: 'Fructe de vită-de-vie uscate înainte de sortare / alt tratament fizic',
    keywords: [],
    limit_afb1: 5.0, limit_afla_sum: 10.0, limit_ota: 8.0,
    source: 'Reg. (UE) 2023/915, Anexa I, pct. 1.1.1 și 1.2.1.1'
  },
  {
    id: 'durum-wheat-unprocessed',
    label: 'Grâu dur neprocesat pentru prima etapă de procesare',
    keywords: [],
    limit_afb1: 2.0, limit_afla_sum: 4.0, limit_ota: 5.0,
    limit_don: 1500, limit_zea: 100, limit_fum: null,
    source: 'Reg. (UE) 2023/915, Anexa I: AFB1/sumă pct. 1.1.12; OTA pct. 1.2.9; DON pct. 1.4.2 (grâu dur neprocesat); ZEA pct. 1.5.1'
  },
  {
    id: 'oats-unprocessed',
    label: 'Ovăz neprocesat (cu pleavă) pentru prima etapă de procesare',
    keywords: [],
    limit_afb1: 2.0, limit_afla_sum: 4.0, limit_ota: 5.0,
    limit_don: 1750, limit_zea: 100, limit_fum: null,
    source: 'Reg. (UE) 2023/915, Anexa I: AFB1/sumă pct. 1.1.12; OTA pct. 1.2.9 (la ovăz, boabe cu pleavă); DON pct. 1.4.3 (ovăz neprocesat cu pleavă necomestibilă, pleava inclusă în măsurare); ZEA pct. 1.5.1'
  },
  {
    id: 'oilseeds-ota-final',
    label: 'Semințe de floarea-soarelui, dovleac, pepene, cânepă și boabe de soia pentru consumatorul final',
    keywords: [],
    limit_afb1: 2.0, limit_afla_sum: 4.0, limit_ota: 5.0,
    source: 'Reg. (UE) 2023/915, Anexa I: aflatoxine pct. 1.1.5 (arahide și alte semințe oleaginoase); OTA pct. 1.2.8'
  },
  {
    id: 'pistachios-sorting',
    label: 'Fistic înainte de sortare / tratament fizic',
    keywords: [],
    limit_afb1: 12.0, limit_afla_sum: 15.0, limit_ota: 10.0,
    source: 'Reg. (UE) 2023/915, Anexa I, pct. 1.1.8 (aflatoxine) și 1.2.3 (OTA)'
  },
  {
    id: 'pistachios-final',
    label: 'Fistic pentru consumatorul final',
    keywords: [],
    limit_afb1: 8.0, limit_afla_sum: 10.0, limit_ota: 5.0,
    source: 'Reg. (UE) 2023/915, Anexa I, pct. 1.1.9 (aflatoxine) și 1.2.4 (OTA)'
  },
  {
    id: 'instant-coffee',
    label: 'Cafea solubilă (instant)',
    keywords: [],
    limit_afb1: null, limit_afla_sum: null, limit_ota: 5.0,
    source: 'Reg. (UE) 2023/915, Anexa I, pct. 1.2.15'
  }
];

function baseGetRuleProfile(category = '', productName = '') {
  const text = `${category} ${productName}`.toLowerCase();

  // Verificare prioritara: daca textul contine eticheta EXACTA a unui profil
  // (cazul cand proprietarul a ales explicit categoria dintr-o lista, nu a
  // scris liber), acel profil e potrivirea corecta, indiferent de ambiguitati
  // intre cuvinte-cheie ale unor profiluri generale vs. specifice/sortare.
  const exactLabelMatch = RULE_PROFILES.find(r => text.includes(r.label.toLowerCase()));

  // Capsicum spp. are limita OTA proprie (mai mare decat restul mirodeniilor),
  // deci are prioritate fata de categoria generala "Mirodenii uscate", chiar
  // daca aceasta a fost aleasa explicit din lista. Nu suprascrie alte etichete exacte.
  // Exceptie: un amestec de mirodenii (text cu "amestec", "mix", "mixtura") care
  // contine Capsicum ramane la limita generala a mirodeniilor (spices-dried).
  const capsicum = RULE_PROFILES.find(r => r.id === 'capsicum-dried');
  if ((!exactLabelMatch || exactLabelMatch.id === 'spices-dried') && capsicum.keywords.some(k => text.includes(k))) {
    const isMixture = /amestec|mix/.test(text);
    return isMixture ? RULE_PROFILES.find(r => r.id === 'spices-dried') : capsicum;
  }
  if (exactLabelMatch) return exactLabelMatch;

  // Profilurile de "sortare / tratament fizic" sunt verificate primele pentru
  // a permite formulari explicite (limite mai permisive, produs neprocesat final).
  const sortingProfiles = ['maize-rice-sorting', 'dried-fruit-sorting', 'peanuts-oilseeds-sorting', 'tree-nuts-sorting', 'almonds-pistachios-apricot-sorting', 'hazelnuts-brazil-sorting'];
  for (const id of sortingProfiles) {
    const profile = RULE_PROFILES.find(r => r.id === id && r.keywords.some(k => text.includes(k)));
    if (profile) return profile;
  }
  const unprocessed = RULE_PROFILES.find(r => r.id === 'unprocessed-cereals' && r.keywords.some(k => text.includes(k)));
  if (unprocessed) return unprocessed;

  // Profiluri specifice (subcategorii cu limite proprii) inaintea celor generale.
  const specificProfiles = [
    'dried-figs-final', 'almonds-pistachios-apricot-final', 'hazelnuts-brazil-final',
    'roasted-coffee', 'wine', 'raw-milk', 'capsicum-dried', 'spices-dried', 'maize-unprocessed'
  ];
  for (const id of specificProfiles) {
    const profile = RULE_PROFILES.find(r => r.id === id && r.keywords.some(k => text.includes(k)));
    if (profile) return profile;
  }

  // Profiluri generale de categorie.
  const generalProfiles = ['maize-final-consumer', 'rice-final-consumer', 'cereals-final-consumer', 'dried-fruit-final', 'peanuts-oilseeds-final', 'tree-nuts-final'];
  for (const id of generalProfiles) {
    const profile = RULE_PROFILES.find(r => r.id === id && r.keywords.some(k => text.includes(k)));
    if (profile) return profile;
  }

  return null;
}

// Rafinari: cand profilul general ales (prin eticheta sau cuvinte-cheie) are o subcategorie cu
// limite proprii in Anexa I, produsul numit explicit in text trece la profilul specific.
// Exemple verificate: faina (DON 600, nu 750), stafide (OTA 8, nu 2), grau dur / ovaz neprocesat
// (DON 1500 / 1750), semintele de floarea-soarelui etc. (OTA 5), fisticul (OTA 5 / 10),
// cafeaua solubila (OTA 5). Sursa: Anexa I a Reg. (UE) 2023/915, vezi profilurile de mai sus.
const REFINEMENTS = [
  { from: ['cereals-final-consumer'], to: 'cereal-milling-products', keywords: ['făină', 'faina', 'farina', 'griș', 'gris', 'semolină', 'semolina'], unless: /porumb|orez/ },
  { from: ['dried-fruit-final'], to: 'dried-vine-fruit-final', keywords: ['stafid', 'coarin', 'sultanin', 'struguri uscați', 'struguri uscati'] },
  { from: ['dried-fruit-sorting'], to: 'dried-vine-fruit-sorting', keywords: ['stafid', 'coarin', 'sultanin', 'struguri uscați', 'struguri uscati'] },
  { from: ['unprocessed-cereals'], to: 'durum-wheat-unprocessed', keywords: ['grâu dur', 'grau dur', 'durum'] },
  { from: ['unprocessed-cereals'], to: 'oats-unprocessed', keywords: ['ovăz', 'ovaz'] },
  { from: ['peanuts-oilseeds-final'], to: 'oilseeds-ota-final', keywords: ['floarea soarelui', 'floarea-soarelui', 'semințe de dovleac', 'seminte de dovleac', 'semințe de pepene', 'seminte de pepene', 'cânepă', 'canepa', 'soia'] },
  { from: ['almonds-pistachios-apricot-sorting'], to: 'pistachios-sorting', keywords: ['fistic'], unless: /migdale|sâmbur|sambur|caise/ },
  { from: ['almonds-pistachios-apricot-final'], to: 'pistachios-final', keywords: ['fistic'], unless: /migdale|sâmbur|sambur|caise/ },
  { from: ['roasted-coffee'], to: 'instant-coffee', keywords: ['solubil', 'instant'] }
];

function getRuleProfile(category = '', productName = '') {
  const text = `${category} ${productName}`.toLowerCase();
  const profile = baseGetRuleProfile(category, productName);
  for (const r of REFINEMENTS) {
    // Rafinarea se aplica peste profilul general gasit sau, daca textul liber nu
    // a dus la niciun profil general, direct pe cuvintele-cheie specifice.
    if (profile && !r.from.includes(profile.id)) continue;
    if (r.unless && r.unless.test(text)) continue;
    if (r.keywords.some(k => text.includes(k))) {
      const target = RULE_PROFILES.find(x => x.id === r.to);
      if (target) return target;
    }
  }
  return profile;
}

// --- Etapa B5 (L2, L3, L4): regula de decizie si performanta metodei -----------
// Regula implicita 'simple' pastreaza comportamentul anterior: depasire daca
// valoarea > limita, fara incertitudine. Regula 'reg_2782_u' aplica regula de
// acceptare din Reg. (UE) 2023/2782, anexa I (loturi: respingere doar daca
// valoarea [corectata pentru recuperare] minus incertitudinea extinsa depaseste
// limita maxima) [formularea exacta de reverificat pe EUR-Lex inainte de
// utilizare reala]. Incertitudinea extinsa este relativa (%), k = 2, pe grup de
// analiza; pentru suma aflatoxinelor se foloseste valoarea grupului
// 'aflatoxins' [de verificat metrologic de laborator].
const DECISION_RULES = ['simple', 'reg_2782_u'];
const PERFORMANCE_GROUPS = ['aflatoxins', 'ota', 'm1', 'don', 'zea', 'fum'];
const ANALYTE_GROUP = { afb1: 'aflatoxins', afb2: 'aflatoxins', afg1: 'aflatoxins', afg2: 'aflatoxins', aflaSum: 'aflatoxins', ota: 'ota', m1: 'm1', don: 'don', zea: 'zea', fum: 'fum' };

function parsePerformance(result) {
  let p = result.method_performance;
  if (!p && result.method_performance_json) {
    try { p = JSON.parse(result.method_performance_json); } catch (_) { p = null; }
  }
  return p && typeof p === 'object' ? p : {};
}
function decisionRuleOf(result) {
  const r = result.decision_rule;
  return DECISION_RULES.includes(r) ? r : 'simple';
}

// Verdict pe analit: 'conform' | 'non_conform' | 'within_uncertainty' (valoare
// peste limita, dar limita este in intervalul valoare ± U - acceptat de regula
// reg_2782_u, semnalat explicit) | null (fara valoare sau fara limita).
function judge(value, limit, rule, uRelPct) {
  if (value === null || value === undefined || limit === null || limit === undefined) return null;
  if (!(value > limit)) return 'conform';
  if (rule === 'reg_2782_u' && Number.isFinite(uRelPct) && uRelPct > 0) {
    const uAbs = value * uRelPct / 100;
    return (value - uAbs > limit) ? 'non_conform' : 'within_uncertainty';
  }
  return 'non_conform';
}

function exceeds(result, key, limit, value) {
  const rule = decisionRuleOf(result);
  const perf = parsePerformance(result);
  const g = perf[ANALYTE_GROUP[key]] || {};
  return judge(value, limit, rule, Number(g.uRelPct)) === 'non_conform';
}

// Detaliu de decizie per analit (pentru buletin/audit): valoare, limita,
// performanta metodei, "<LOQ" si verdict, dupa regula de decizie a probei.
function decisionDetail(result) {
  const rule = decisionRuleOf(result);
  const perf = parsePerformance(result);
  const limitOf = { afb1: result.limit_afb1, aflaSum: result.limit_afla_sum, ota: result.limit_ota, m1: result.limit_m1, don: result.limit_don, zea: result.limit_zea, fum: result.limit_fum };
  const afVals = [result.afb1, result.afb2, result.afg1, result.afg2];
  const sum = afVals.every(v => v !== null && v !== undefined) ? afVals.reduce((a, b) => a + b, 0) : null;
  const values = { afb1: result.afb1, aflaSum: sum, ota: result.ota, m1: result.m1, don: result.don, zea: result.zea, fum: result.fum };
  const rows = {};
  for (const key of Object.keys(values)) {
    const g = perf[ANALYTE_GROUP[key]] || {};
    const uRelPct = Number.isFinite(Number(g.uRelPct)) && g.uRelPct !== null && g.uRelPct !== '' ? Number(g.uRelPct) : null;
    const loq = Number.isFinite(Number(g.loq)) && g.loq !== null && g.loq !== '' ? Number(g.loq) : null;
    const value = values[key];
    rows[key] = {
      value: value ?? null, limit: limitOf[key] ?? null, uRelPct, uK: uRelPct === null ? null : 2,
      recoveryPct: Number.isFinite(Number(g.recoveryPct)) && g.recoveryPct !== null && g.recoveryPct !== '' ? Number(g.recoveryPct) : null,
      loq, belowLoq: loq !== null && value !== null && value !== undefined && value < loq,
      verdict: judge(value, limitOf[key], rule, uRelPct)
    };
  }
  return { rule, rows };
}

function evaluateResult(result) {
  if (!result) return 'pending';
  // QC respins inseamna ca proba nu poate fi evaluata normal, indiferent de
  // ce valori exista deja introduse - suprascrie orice alt calcul.
  if (result.qc_status === 'rejected') return 'cancelled';

  // Un camp e "relevant" doar daca are o limita legala setata pentru acest tip
  // de proba - la lapte, de exemplu, doar M1 se aplica, restul raman irelevante
  // si nu trebuie sa blocheze finalizarea probei. DON, zearalenona si
  // fumonizinele sunt tratate la fel - independente unele de altele si de
  // aflatoxine/OTA/M1, relevante doar cand proba are limita lor setata.
  const fieldLimitMap = {
    afb1: 'limit_afb1', afg1: null, afg2: null, ota: 'limit_ota', m1: 'limit_m1',
    don: 'limit_don', zea: 'limit_zea', fum: 'limit_fum'
  };
  const aflaSumRelevant = result.limit_afla_sum !== null && result.limit_afla_sum !== undefined;

  const relevantFields = ['afb1', 'ota', 'm1', 'don', 'zea', 'fum'].filter(f => {
    const limitKey = fieldLimitMap[f];
    return limitKey && result[limitKey] !== null && result[limitKey] !== undefined;
  });
  if (aflaSumRelevant) relevantFields.push('afb2', 'afg1', 'afg2');
  // afb1 e deja necesar pentru limita proprie; daca suma e relevanta dar afb1
  // nu are limita proprie (nu ar trebui sa fie cazul in profilurile actuale),
  // tot il includem, fiindca intra in calculul sumei.
  if (aflaSumRelevant && !relevantFields.includes('afb1')) relevantFields.push('afb1');

  const hasAny = relevantFields.some(f => result[f] !== null && result[f] !== undefined);
  if (!hasAny) return 'pending';

  const allEntered = relevantFields.every(f => result[f] !== null && result[f] !== undefined);

  let anyOver = false;
  if (result.afb1 !== null && result.limit_afb1 !== null && exceeds(result, 'afb1', result.limit_afb1, result.afb1)) anyOver = true;
  if (result.ota !== null && result.limit_ota !== null && exceeds(result, 'ota', result.limit_ota, result.ota)) anyOver = true;
  if (result.limit_m1 !== null && result.limit_m1 !== undefined && result.m1 !== null && result.m1 !== undefined && exceeds(result, 'm1', result.limit_m1, result.m1)) anyOver = true;
  if (result.limit_don !== null && result.limit_don !== undefined && result.don !== null && result.don !== undefined && exceeds(result, 'don', result.limit_don, result.don)) anyOver = true;
  if (result.limit_zea !== null && result.limit_zea !== undefined && result.zea !== null && result.zea !== undefined && exceeds(result, 'zea', result.limit_zea, result.zea)) anyOver = true;
  if (result.limit_fum !== null && result.limit_fum !== undefined && result.fum !== null && result.fum !== undefined && exceeds(result, 'fum', result.limit_fum, result.fum)) anyOver = true;

  if (aflaSumRelevant) {
    const afVals = [result.afb1, result.afb2, result.afg1, result.afg2];
    const afAllEntered = afVals.every(v => v !== null && v !== undefined);
    if (afAllEntered) {
      const sum = afVals.reduce((a, b) => a + b, 0);
      if (exceeds(result, 'aflaSum', result.limit_afla_sum, sum)) anyOver = true;
    }
  }

  if (anyOver) return 'fail';
  if (allEntered) return 'ok';
  return 'in_analysis';
}

// Evaluarea completa (toti analitii: aflatoxine, OTA, M1, DON, ZEA, fumonizine)
// pornind de la un rand de interogare cu aliasurile folosite in rutele de
// arhiva/export (afb1..fum, limitAfb1..limitFum, qcStatus). Delega la
// evaluateResult(), deci aplica exact aceeasi logica ca in coada si detaliu.
function evaluateArchiveRow(r) {
  return evaluateResult({
    afb1: r.afb1, afb2: r.afb2, afg1: r.afg1, afg2: r.afg2, ota: r.ota, m1: r.m1, don: r.don, zea: r.zea, fum: r.fum,
    limit_afb1: r.limitAfb1, limit_afla_sum: r.limitAflaSum, limit_ota: r.limitOta, limit_m1: r.limitM1,
    limit_don: r.limitDon, limit_zea: r.limitZea, limit_fum: r.limitFum, qc_status: r.qcStatus,
    decision_rule: r.decisionRule, method_performance_json: r.methodPerformanceJson
  });
}

// Grupuri de analize comandabile separat de client, la pretul lor propriu -
// aflatoxinele (B1+B2+G1+G2+suma) se testeaza mereu impreuna ca un singur
// pachet (limita legala foloseste explicit suma lor), restul contaminantilor
// sunt teste independente, comandabile separat.
const TEST_GROUP_KEYS = ['aflatoxins', 'ota', 'm1', 'don', 'zea', 'fum'];

// Determina ce grupuri de analize sunt disponibile (au limita legala
// aplicabila) pentru un profil de categorie dat. Fara profil (categorie
// libera / necunoscuta), toate grupurile raman disponibile - clientul poate
// alege liber, ca la un laborator care nu are inca o regula predefinita
// pentru acel produs.
function availableGroupsForProfile(profile) {
  if (!profile) return [...TEST_GROUP_KEYS];
  const has = (v) => v !== null && v !== undefined;
  const groups = [];
  if (has(profile.limit_afb1) || has(profile.limit_afla_sum)) groups.push('aflatoxins');
  if (has(profile.limit_ota)) groups.push('ota');
  if (has(profile.limit_m1)) groups.push('m1');
  if (has(profile.limit_don)) groups.push('don');
  if (has(profile.limit_zea)) groups.push('zea');
  if (has(profile.limit_fum)) groups.push('fum');
  return groups;
}

// Referinta de reglementare pentru profilurile de limite (Etapa B2, L5).
const LIMIT_REGULATION_REF = 'Reg. (UE) 2023/915, versiunea consolidată 02023R0915-20250101 [de reconfirmat înainte de utilizare reală]';

module.exports = {
  LIMIT_REGULATION_REF, DECISION_RULES, PERFORMANCE_GROUPS, decisionDetail, DEFAULT_LIMITS, RULE_PROFILES, getRuleProfile, evaluateResult, evaluateArchiveRow, TEST_GROUP_KEYS, availableGroupsForProfile };

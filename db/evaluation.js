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
    source: 'Regulamentul (UE) 2023/915, Anexa I, pct. 1.1.4 și 1.2.3'
  },
  {
    id: 'dried-fruit-sorting',
    label: 'Fructe uscate înainte de sortare / alt tratament fizic',
    keywords: ['fructe uscate sortare', 'fructe uscate tratament fizic'],
    limit_afb1: 5.0, limit_afla_sum: 10.0, limit_ota: 2.0,
    source: 'Regulamentul (UE) 2023/915, Anexa I, pct. 1.1.3 și 1.2.3'
  },
  {
    id: 'dried-figs-final',
    label: 'Smochine uscate pentru consumatorul final',
    keywords: ['smochine uscate', 'smochine'],
    limit_afb1: 6.0, limit_afla_sum: 10.0, limit_ota: 8.0,
    source: 'Regulamentul (UE) 2023/915, Anexa I, pct. 1.1.6 și 1.2.2'
  },
  {
    id: 'peanuts-oilseeds-final',
    label: 'Arahide și alte semințe oleaginoase pentru consumatorul final',
    keywords: ['arahide', 'semințe oleaginoase', 'seminte oleaginoase', 'floarea soarelui', 'rapiță', 'rapita', 'soia'],
    limit_afb1: 2.0, limit_afla_sum: 4.0, limit_ota: null,
    source: 'Regulamentul (UE) 2023/915, Anexa I, pct. 1.1.9'
  },
  {
    id: 'peanuts-oilseeds-sorting',
    label: 'Arahide și semințe oleaginoase înainte de sortare',
    keywords: ['arahide sortare', 'arahide tratament fizic'],
    limit_afb1: 8.0, limit_afla_sum: 15.0, limit_ota: null,
    source: 'Regulamentul (UE) 2023/915, Anexa I, pct. 1.1.7'
  },
  {
    id: 'tree-nuts-final',
    label: 'Fructe cu coajă lemnoasă pentru consumatorul final (exclusiv migdale/fistic/caise/alune de pădure/nuci de Brazilia)',
    keywords: ['nuci', 'alune', 'fructe cu coajă', 'fructe cu coaja'],
    limit_afb1: 2.0, limit_afla_sum: 4.0, limit_ota: null,
    source: 'Regulamentul (UE) 2023/915, Anexa I, pct. 1.1.11'
  },
  {
    id: 'tree-nuts-sorting',
    label: 'Fructe cu coajă lemnoasă înainte de sortare',
    keywords: ['nuci sortare', 'alune sortare', 'fructe cu coajă sortare'],
    limit_afb1: 5.0, limit_afla_sum: 10.0, limit_ota: null,
    source: 'Regulamentul (UE) 2023/915, Anexa I, pct. 1.1.10'
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
    id: 'spices-dried',
    label: 'Mirodenii uscate',
    keywords: ['mirodenii', 'condimente', 'boia', 'piper', 'ghimbir', 'nucșoară', 'nucsoara', 'curcuma', 'turmeric'],
    limit_afb1: 5.0, limit_afla_sum: 10.0, limit_ota: 15.0,
    source: 'Regulamentul (UE) 2023/915, Anexa I, pct. 1.1.14 și 1.2.13'
  },
  {
    id: 'roasted-coffee',
    label: 'Cafea prăjită (boabe și măcinată)',
    keywords: ['cafea', 'cafea prăjită', 'cafea prajita', 'cafea măcinată', 'cafea macinata'],
    limit_afb1: null, limit_afla_sum: null, limit_ota: 3.0,
    source: 'Regulamentul (UE) 2023/915, Anexa I, pct. 1.2.5'
  },
  {
    id: 'wine',
    label: 'Vin și alte băuturi pe bază de must de struguri',
    keywords: ['vin', 'must de struguri', 'must struguri'],
    limit_afb1: null, limit_afla_sum: null, limit_ota: 2.0,
    source: 'Regulamentul (UE) 2023/915, Anexa I, pct. 1.2.8'
  },
  {
    id: 'raw-milk',
    label: 'Lapte crud, lapte tratat termic și lapte pentru produse lactate',
    keywords: ['lapte crud', 'lapte', 'lapte tratat termic'],
    limit_afb1: null, limit_afla_sum: null, limit_ota: null, limit_m1: 0.050,
    source: 'Regulamentul (UE) 2023/915, Anexa I, pct. 1.1.15 (aflatoxina M1)'
  }
];

function getRuleProfile(category = '', productName = '') {
  const text = `${category} ${productName}`.toLowerCase();

  // Verificare prioritara: daca textul contine eticheta EXACTA a unui profil
  // (cazul cand proprietarul a ales explicit categoria dintr-o lista, nu a
  // scris liber), acel profil e potrivirea corecta, indiferent de ambiguitati
  // intre cuvinte-cheie ale unor profiluri generale vs. specifice/sortare.
  const exactLabelMatch = RULE_PROFILES.find(r => text.includes(r.label.toLowerCase()));
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
    'roasted-coffee', 'wine', 'raw-milk', 'spices-dried', 'maize-unprocessed'
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
  if (result.afb1 !== null && result.limit_afb1 !== null && result.afb1 > result.limit_afb1) anyOver = true;
  if (result.ota !== null && result.limit_ota !== null && result.ota > result.limit_ota) anyOver = true;
  if (result.limit_m1 !== null && result.limit_m1 !== undefined && result.m1 !== null && result.m1 !== undefined && result.m1 > result.limit_m1) anyOver = true;
  if (result.limit_don !== null && result.limit_don !== undefined && result.don !== null && result.don !== undefined && result.don > result.limit_don) anyOver = true;
  if (result.limit_zea !== null && result.limit_zea !== undefined && result.zea !== null && result.zea !== undefined && result.zea > result.limit_zea) anyOver = true;
  if (result.limit_fum !== null && result.limit_fum !== undefined && result.fum !== null && result.fum !== undefined && result.fum > result.limit_fum) anyOver = true;

  if (aflaSumRelevant) {
    const afVals = [result.afb1, result.afb2, result.afg1, result.afg2];
    const afAllEntered = afVals.every(v => v !== null && v !== undefined);
    if (afAllEntered) {
      const sum = afVals.reduce((a, b) => a + b, 0);
      if (sum > result.limit_afla_sum) anyOver = true;
    }
  }

  if (anyOver) return 'fail';
  if (allEntered) return 'ok';
  return 'in_analysis';
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

module.exports = { DEFAULT_LIMITS, RULE_PROFILES, getRuleProfile, evaluateResult, TEST_GROUP_KEYS, availableGroupsForProfile };

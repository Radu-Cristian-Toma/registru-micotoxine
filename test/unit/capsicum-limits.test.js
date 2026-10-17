// Profil Capsicum spp. (OTA 20 µg/kg) si neschimbarea celorlalte limite.
// Valori inventate; nu se foloseste baza de date.
const test = require('node:test');
const assert = require('node:assert/strict');
const { RULE_PROFILES, getRuleProfile, evaluateResult } = require('../../db/evaluation');

const FIELDS = ['limit_afb1', 'limit_afla_sum', 'limit_ota', 'limit_m1', 'limit_don', 'limit_zea', 'limit_fum'];

// Referinta: limitele din versiunea anterioara (nemodificate). null = fara limita.
const BASELINE = {
  'cereals-final-consumer': [2, 4, 3, null, 750, 75, null],
  'unprocessed-cereals': [2, 4, 5, null, 1000, 100, null],
  'maize-final-consumer': [2, 4, 3, null, 750, 100, 1000],
  'maize-unprocessed': [2, 4, 5, null, 1500, 350, 4000],
  'maize-rice-sorting': [5, 10, 5, null, null, null, null],
  'rice-final-consumer': [2, 4, 3, null, null, null, null],
  'dried-fruit-final': [2, 4, 2, null, null, null, null],
  'dried-fruit-sorting': [5, 10, 2, null, null, null, null],
  'dried-figs-final': [6, 10, 8, null, null, null, null],
  'peanuts-oilseeds-final': [2, 4, null, null, null, null, null],
  'peanuts-oilseeds-sorting': [8, 15, null, null, null, null, null],
  'tree-nuts-final': [2, 4, null, null, null, null, null],
  'tree-nuts-sorting': [5, 10, null, null, null, null, null],
  'almonds-pistachios-apricot-sorting': [12, 15, null, null, null, null, null],
  'almonds-pistachios-apricot-final': [8, 10, null, null, null, null, null],
  'hazelnuts-brazil-sorting': [8, 15, null, null, null, null, null],
  'hazelnuts-brazil-final': [5, 10, null, null, null, null, null],
  'spices-dried': [5, 10, 15, null, null, null, null],
  'roasted-coffee': [null, null, 3, null, null, null, null],
  'wine': [null, null, 2, null, null, null, null],
  'raw-milk': [null, null, null, 0.05, null, null, null],
};
const CAPSICUM = [5, 10, 20, null, null, null, null];

const limitsOf = (p) => FIELDS.map(f => p[f] ?? null);

// Evaluare completa pentru un profil: aflatoxine sub limita, OTA variabil.
function evalOta(profile, ota) {
  return evaluateResult({
    afb1: 1, afb2: 0.5, afg1: 0.5, afg2: 0.5, ota,
    limit_afb1: profile.limit_afb1, limit_afla_sum: profile.limit_afla_sum, limit_ota: profile.limit_ota,
    qc_status: 'accepted',
  });
}

test('limitele tuturor profilurilor existente sunt neschimbate', () => {
  for (const [id, expected] of Object.entries(BASELINE)) {
    const p = RULE_PROFILES.find(r => r.id === id);
    assert.ok(p, `profilul ${id} lipsește`);
    assert.deepEqual(limitsOf(p), expected, id);
  }
});

test('lista de profiluri conține exact profilurile de referință plus Capsicum', () => {
  assert.deepEqual(RULE_PROFILES.map(r => r.id).sort(), [...Object.keys(BASELINE), 'capsicum-dried'].sort());
});

test('profilul Capsicum: OTA 20, restul limitelor copiate din spices-dried', () => {
  const p = RULE_PROFILES.find(r => r.id === 'capsicum-dried');
  assert.deepEqual(limitsOf(p), CAPSICUM);
  assert.match(p.source, /1\.2\.18/);
});

test('cuvintele-cheie Capsicum duc la profilul nou', () => {
  for (const kw of ['boia', 'paprika', 'ardei iute', 'chilli', 'cayenne']) {
    assert.equal(getRuleProfile('', `Produs ${kw} măcinat`).id, 'capsicum-dried', kw);
  }
});

test('Capsicum are prioritate și când categoria generală „Mirodenii uscate” este aleasă explicit', () => {
  assert.equal(getRuleProfile('Mirodenii uscate', 'Boia dulce').id, 'capsicum-dried');
});

test('restul mirodeniilor rămân la spices-dried (OTA 15)', () => {
  for (const name of ['Piper negru', 'Ghimbir', 'Curcuma', 'Nucșoară']) {
    const p = getRuleProfile('', name);
    assert.equal(p.id, 'spices-dried', name);
    assert.equal(p.limit_ota, 15);
  }
  assert.equal(getRuleProfile('Mirodenii uscate', 'Piper alb').id, 'spices-dried');
  assert.ok(!RULE_PROFILES.find(r => r.id === 'spices-dried').keywords.includes('boia'));
});

test('boia cu OTA 18 µg/kg: conform', () => {
  assert.equal(evalOta(getRuleProfile('', 'Boia dulce'), 18), 'ok');
});

test('boia cu OTA 22 µg/kg: neconform', () => {
  assert.equal(evalOta(getRuleProfile('', 'Boia dulce'), 22), 'fail');
});

test('piper cu OTA 18 µg/kg: neconform', () => {
  assert.equal(evalOta(getRuleProfile('', 'Piper negru'), 18), 'fail');
});

test('alte potriviri nu sunt afectate (mapări reprezentative)', () => {
  const cases = {
    'Grâu': 'cereals-final-consumer', 'Porumb': 'maize-final-consumer', 'Orez': 'rice-final-consumer',
    'Smochine uscate': 'dried-figs-final', 'Arahide': 'peanuts-oilseeds-final', 'Cafea prăjită': 'roasted-coffee',
    'Vin': 'wine', 'Lapte crud': 'raw-milk', 'Porumb sortare': 'maize-rice-sorting',
  };
  for (const [name, id] of Object.entries(cases)) assert.equal(getRuleProfile('', name).id, id, name);
});

test('amestecuri de mirodenii cu Capsicum: limita OTA 15 (spices-dried)', () => {
  for (const name of ['Amestec mirodenii cu boia', 'Mix chilli și piper', 'Mixtură paprika']) {
    assert.equal(getRuleProfile('', name).id, 'spices-dried', name);
    assert.equal(getRuleProfile('Mirodenii uscate', name).id, 'spices-dried', `${name} (categorie explicită)`);
  }
});

test('„Amestec mirodenii cu boia” cu OTA 18: neconform', () => {
  assert.equal(evalOta(getRuleProfile('', 'Amestec mirodenii cu boia'), 18), 'fail');
});

test('„Mix chilli și piper” cu OTA 18: neconform', () => {
  assert.equal(evalOta(getRuleProfile('', 'Mix chilli și piper'), 18), 'fail');
});

test('„Boia dulce” cu OTA 18: conform; „Piper negru” cu 18: neconform', () => {
  assert.equal(evalOta(getRuleProfile('', 'Boia dulce'), 18), 'ok');
  assert.equal(evalOta(getRuleProfile('', 'Piper negru'), 18), 'fail');
});

test('cuvântul „amestec” fără Capsicum nu schimbă potrivirea altor produse', () => {
  assert.equal(getRuleProfile('', 'Amestec cereale grâu').id, 'cereals-final-consumer');
  assert.equal(getRuleProfile('', 'Boia dulce').id, 'capsicum-dried');
});

test('citările source ale fructelor uscate și smochinelor conțin punctele de aflatoxine corectate', () => {
  const src = (id) => RULE_PROFILES.find(r => r.id === id).source;
  assert.match(src('dried-fruit-final'), /pct\. 1\.1\.2 și 1\.2\.1\.2/);
  assert.match(src('dried-fruit-sorting'), /pct\. 1\.1\.1 și 1\.2\.1\.2/);
  assert.match(src('dried-figs-final'), /pct\. 1\.1\.3 și 1\.2\.1\.1/);
});

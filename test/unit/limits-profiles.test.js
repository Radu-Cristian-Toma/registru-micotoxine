// Etapa B (L23/L24): profiluri de limite confruntate cu Anexa I a Reg. (UE) 2023/915
// (versiunea consolidata 02023R0915-20250101). Fara baza de date; date inventate.
const test = require('node:test');
const assert = require('node:assert/strict');
const { getRuleProfile, RULE_PROFILES, evaluateResult, availableGroupsForProfile } = require('../../db/evaluation');

const id = (category, name) => (getRuleProfile(category, name) || {}).id || null;

test('făina: DON 600 (pct. 1.4.5), nu 750', () => {
  for (const [cat, name] of [['', 'făină de grâu'], ['Cereale / produse derivate pentru consumatorul final', 'făină albă 000'], ['', 'griș']]) {
    const p = getRuleProfile(cat, name);
    assert.equal(p.id, 'cereal-milling-products', name);
    assert.equal(p.limit_don, 600);
    assert.equal(p.limit_zea, 75);
    assert.equal(p.limit_ota, 3.0);
  }
  const r = { afb1: 0.1, afb2: 0, afg1: 0, afg2: 0, ota: 0.5, don: 650, zea: 10,
    limit_afb1: 2, limit_afla_sum: 4, limit_ota: 3, limit_don: 600, limit_zea: 75, qc_status: 'accepted' };
  assert.equal(evaluateResult(r), 'fail');
  assert.equal(evaluateResult({ ...r, don: 590 }), 'ok');
});

test('făina de porumb și de orez nu cade în profilul făinii de grâu', () => {
  assert.equal(id('', 'făină de porumb'), 'maize-final-consumer');
  assert.equal(id('', 'făină de orez'), 'rice-final-consumer');
  assert.equal(id('Porumb și produse derivate pentru consumatorul final', 'făină de mălai'), 'maize-final-consumer');
});

test('cerealele întregi pentru consumatorul final rămân la DON 750', () => {
  assert.equal(getRuleProfile('Cereale / produse derivate pentru consumatorul final', 'boabe de grâu').limit_don, 750);
});

test('fructele de vită-de-vie uscate: OTA 8 (pct. 1.2.1.1); alte fructe uscate: 2 (pct. 1.2.1.2)', () => {
  for (const [cat, name] of [['', 'stafide'], ['Fructe uscate pentru consumatorul final (exclusiv smochine)', 'stafide sultanine'], ['', 'coarințe']]) {
    const p = getRuleProfile(cat, name);
    assert.equal(p.id, 'dried-vine-fruit-final', name);
    assert.equal(p.limit_ota, 8.0);
    assert.equal(p.limit_afb1, 2.0);
    assert.equal(p.limit_afla_sum, 4.0);
  }
  assert.equal(id('', 'prune uscate'), 'dried-fruit-final');
  assert.equal(getRuleProfile('', 'prune uscate').limit_ota, 2.0);
  const sorting = getRuleProfile('Fructe uscate înainte de sortare / alt tratament fizic', 'stafide');
  assert.equal(sorting.id, 'dried-vine-fruit-sorting');
  assert.equal(sorting.limit_ota, 8.0);
  assert.equal(sorting.limit_afb1, 5.0);
});

test('grâu dur și ovăz neprocesat: DON 1500 și 1750 (pct. 1.4.2, 1.4.3)', () => {
  const cat = 'Cereale neprocesate pentru prima etapă de procesare';
  assert.equal(getRuleProfile(cat, 'grâu dur').limit_don, 1500);
  assert.equal(getRuleProfile(cat, 'ovăz').limit_don, 1750);
  assert.equal(getRuleProfile(cat, 'orz').id, 'unprocessed-cereals');
  assert.equal(getRuleProfile(cat, 'orz').limit_don, 1000);
});

test('semințele de floarea-soarelui, dovleac, soia: OTA 5 (pct. 1.2.8)', () => {
  for (const name of ['semințe de floarea soarelui', 'boabe de soia', 'semințe de dovleac']) {
    const p = getRuleProfile('', name);
    assert.equal(p.id, 'oilseeds-ota-final', name);
    assert.equal(p.limit_ota, 5.0);
    assert.ok(availableGroupsForProfile(p).includes('ota'));
  }
  assert.equal(id('', 'arahide'), 'peanuts-oilseeds-final');
  assert.equal(getRuleProfile('', 'arahide').limit_ota, null);
});

test('fisticul are OTA propriu (pct. 1.2.3 și 1.2.4); migdalele rămân fără OTA', () => {
  assert.equal(getRuleProfile('', 'fistic').limit_ota, 5.0);
  assert.equal(getRuleProfile('', 'fistic sortare').limit_ota, 10.0);
  assert.equal(getRuleProfile('', 'fistic sortare').limit_afb1, 12.0);
  assert.equal(getRuleProfile('', 'fistic').limit_afb1, 8.0);
  assert.equal(id('', 'migdale'), 'almonds-pistachios-apricot-final');
  assert.equal(getRuleProfile('', 'migdale').limit_ota, null);
  assert.equal(id('Migdale, fistic, sâmburi de caise pentru consumatorul final', 'migdale și fistic'), 'almonds-pistachios-apricot-final');
});

test('cafeaua solubilă: OTA 5 (pct. 1.2.15); cafeaua prăjită: 3', () => {
  assert.equal(getRuleProfile('', 'cafea solubilă').limit_ota, 5.0);
  assert.equal(getRuleProfile('', 'cafea instant').id, 'instant-coffee');
  assert.equal(getRuleProfile('', 'cafea prăjită').limit_ota, 3.0);
});

test('profilurile adăugate sunt accesibile prin eticheta exactă', () => {
  for (const pid of ['cereal-milling-products', 'dried-vine-fruit-final', 'dried-vine-fruit-sorting', 'durum-wheat-unprocessed', 'oats-unprocessed', 'oilseeds-ota-final', 'pistachios-sorting', 'pistachios-final', 'instant-coffee']) {
    const p = RULE_PROFILES.find(r => r.id === pid);
    assert.ok(p, pid);
    assert.equal(getRuleProfile(p.label, '').id, pid);
    assert.match(p.source, /2023\/915/);
  }
});

test('etichetele profilurilor sunt unice și niciuna nu o conține pe alta (potrivire exactă neambiguă)', () => {
  const labels = RULE_PROFILES.map(r => r.label.toLowerCase());
  assert.equal(new Set(labels).size, labels.length);
  for (const a of labels) for (const b of labels) if (a !== b) assert.ok(!a.includes(b), `${a} conține ${b}`);
});

test('fiecare etichetă din server are traducere în i18n.js (categoryLabels)', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '../../public/i18n.js'), 'utf8');
  for (const r of RULE_PROFILES) assert.ok(src.includes(`'${r.label}':`), `lipsește traducerea: ${r.label}`);
});

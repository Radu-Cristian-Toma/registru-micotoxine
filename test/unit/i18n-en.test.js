// Traducerea în engleză a interfeței: acoperire, terminologie unitară și absența textelor românești în valorile EN.
// Citește public/i18n.js într-un context izolat și public/lab.js prin extragerea perechilor D('ro','en').
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..', '..');
const i18nSrc = fs.readFileSync(path.join(root, 'public', 'i18n.js'), 'utf8');
const ctx = { window: {}, document: {}, localStorage: { getItem: () => null, setItem() {} }, console };
vm.createContext(ctx);
vm.runInContext(i18nSrc + ';this.TR = TRANSLATIONS; this.limitSourceEn = limitSourceEn; this.VAL = VALIDATION_TESTS_EN; this.valTestText = valTestText; this.setLang = setLang;', ctx);

function pairs() {
  const rows = [];
  (function walk(o, p) {
    for (const k of Object.keys(o)) {
      const v = o[k], pth = p ? p + '.' + k : k;
      if (v && typeof v === 'object' && ('ro' in v || 'en' in v)) rows.push({ path: pth, ro: v.ro, en: v.en });
      else if (v && typeof v === 'object') walk(v, pth);
    }
  })(ctx.TR, '');
  return rows;
}
const labSrc = fs.readFileSync(path.join(root, 'public', 'lab.js'), 'utf8');
const labPairs = [...labSrc.matchAll(/D\(\s*'((?:[^'\\]|\\.)*)'\s*,\s*'((?:[^'\\]|\\.)*)'\s*\)/g)].map(m => ({ ro: m[1], en: m[2] }));
const DIACRITICS = /[ăâîșțĂÂÎȘȚ]/;
const live = pairs().filter(r => !r.path.startsWith('demo.'));

test('fiecare cheie are text EN, fără diacritice românești', () => {
  const all = pairs();
  assert.ok(all.length > 1000 && labPairs.length > 150);
  for (const r of [...all, ...labPairs]) {
    assert.ok(r.en && String(r.en).trim(), `lipsește EN: ${r.path || r.ro}`);
    assert.ok(!DIACRITICS.test(r.en), `diacritice în EN: ${r.path || r.en}`);
  }
});

test('terminologie unitară în engleză: „customer”, „test report”, „compliant”', () => {
  const texts = [...live.map(r => ({ id: r.path, en: String(r.en) })), ...labPairs.map(r => ({ id: r.ro.slice(0, 30), en: r.en }))];
  const banned = [
    [/\bclients?\b/i, 'client → customer'], [/\bbeneficiar/i, 'beneficiary → customer'], [/\bsample owner\b/i, 'sample owner → customer'],
    [/\bbulletins?\b/i, 'bulletin → test report'], [/\bIn uncertainty\b/, 'In uncertainty → Within uncertainty'],
    [/legally certifies|legal signature/i, 'afirmații juridice nepotrivite pentru o semnătură electronică simplă'],
    [/non-conforming (if|only if)/i, 'non-conforming → non-compliant pentru verdictul față de limită'],
    [/\banalyzable\b|analyzes\b/i, 'ortografie americană'], [/\bfusarium toxins\b/, 'Fusarium (nume de gen)']
  ];
  for (const t of texts) for (const [rx, why] of banned) assert.ok(!rx.test(t.en), `${t.id}: ${why} — „${t.en.slice(0, 80)}”`);
});

test('corecții de sens: „Așteaptă analizare” = Awaiting analysis; validează validatorul, nu operatorul', () => {
  const g = (p) => live.find(r => r.path === p);
  assert.equal(g('operator.workloadAwaitingResults').en, 'Awaiting analysis');
  assert.equal(g('operator.flagWithinUncertainty').en, 'Within uncertainty');
  assert.match(g('bulletin.printDisabledHint').en, /validated by a validator/);
  assert.match(g('bulletin.printDisabledHint').ro, /de către validator/);
  assert.doesNotMatch(g('operator.guideValidatorText').ro, /certifică legal/);
  assert.doesNotMatch(g('admin.newValidatorHint').ro, /legal/);
});

test('sursele limitelor din profile sunt traduse integral în engleză', () => {
  const { RULE_PROFILES, LIMIT_REGULATION_REF } = require('../../db/evaluation');
  assert.ok(RULE_PROFILES.length >= 31);
  for (const src of [...RULE_PROFILES.map(p => p.source), LIMIT_REGULATION_REF]) {
    const en = ctx.limitSourceEn(src);
    assert.ok(!DIACRITICS.test(en), `diacritice: ${en}`);
    assert.ok(!/\bpct\b|Anexa|\(UE\)|actualizat| și /.test(en), `rămas românesc: ${en}`);
  }
  assert.match(ctx.limitSourceEn('Regulamentul (UE) 2023/915, Anexa I, pct. 1.1.14 și 1.2.18'), /^Regulation \(EU\) 2023\/915, Annex I, point 1\.1\.14 and 1\.2\.18$/);
});

test('matricea de validare VAL-01…15 are text EN pentru toate testele', () => {
  const codes = Array.from({ length: 15 }, (_, i) => 'VAL-' + String(i + 1).padStart(2, '0'));
  for (const c of codes) {
    const e = ctx.VAL[c];
    assert.ok(e && e.length === 3 && e.every(x => x && !DIACRITICS.test(x)), c);
    assert.doesNotMatch(e.join(' '), /\bclient|bulletin|beneficiar/i, c);
  }
  ctx.setLang('en');
  assert.equal(ctx.valTestText({ code: 'VAL-01', title: 'x', area: 'Acces', expected: 'y' }).area, 'Access');
  assert.equal(ctx.valTestText({ code: 'VAL-99', title: 'x', area: 'Acces', expected: 'y' }).area, 'Access');
  ctx.setLang('ro');
  assert.equal(ctx.valTestText({ code: 'VAL-01', title: 'T', area: 'Acces', expected: 'E' }).title, 'T');
});

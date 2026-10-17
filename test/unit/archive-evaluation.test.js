// L1: arhivele si exporturile CSV evalueaza si M1, DON, ZEA, fumonizine,
// cu aceeasi logica ca in coada. Baza de date este temporara, cu date inventate.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lims-test-'));
process.env.LIMS_DB_PATH = path.join(tmpDir, 'test.db');

const express = require('express');
const db = require('../../db/database');
const resultsRoutes = require('../../routes/results');
const samplesRoutes = require('../../routes/samples');

let server, base, currentUser;
let ownerId, operatorId;

// Analiti testati: fiecare esantion are limita setata doar pentru analitul respectiv.
const ANALYTES = [
  { key: 'm1', col: 'm1', limitCol: 'limit_m1', limit: 0.05, over: 0.2, under: 0.01, header: 'M1 (µg/kg)', limitHeader: 'Limită M1' },
  { key: 'don', col: 'don', limitCol: 'limit_don', limit: 750, over: 900, under: 100, header: 'DON (µg/kg)', limitHeader: 'Limită DON' },
  { key: 'zea', col: 'zea', limitCol: 'limit_zea', limit: 75, over: 120, under: 10, header: 'ZEA (µg/kg)', limitHeader: 'Limită ZEA' },
  { key: 'fum', col: 'fum', limitCol: 'limit_fum', limit: 1000, over: 1500, under: 100, header: 'Fumonizine (µg/kg)', limitHeader: 'Limită Fumonizine' },
];
const codes = {};

function addSample(code, product, { col, limitCol, limit, value, qcStatus = 'accepted' }) {
  const info = db.prepare(`INSERT INTO samples (code, owner_id, product_name, category, sample_date, status) VALUES (?, ?, ?, 'Test', '2026-01-10', 'pending')`)
    .run(code, ownerId, product);
  const sets = [limitCol];
  const vals = [limit];
  if (value !== undefined) { sets.push(col); vals.push(value); }
  db.prepare(`INSERT INTO results (sample_id, ${sets.join(', ')}, qc_status) VALUES (?, ${sets.map(() => '?').join(', ')}, ?)`)
    .run(info.lastInsertRowid, ...vals, qcStatus);
}

test.before(async () => {
  ownerId = db.prepare(`INSERT INTO users (email, password_hash, full_name, role) VALUES ('owner@test.invalid', 'x', 'Beneficiar Test', 'owner')`).run().lastInsertRowid;
  operatorId = db.prepare(`INSERT INTO users (email, password_hash, full_name, role) VALUES ('op@test.invalid', 'x', 'Operator Test', 'operator')`).run().lastInsertRowid;

  let n = 0;
  for (const a of ANALYTES) {
    for (const kind of ['over', 'under', 'missing']) {
      const code = `T-${a.key}-${kind}-${++n}`;
      codes[`${a.key}:${kind}`] = code;
      addSample(code, `Produs ${a.key} ${kind}`, { ...a, value: kind === 'missing' ? undefined : a[kind] });
    }
  }
  codes.cancelled = 'T-cancelled';
  addSample(codes.cancelled, 'Produs anulat', { ...ANALYTES[1], value: ANALYTES[1].over, qcStatus: 'rejected' });

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.session = { user: currentUser }; next(); });
  app.use('/api/results', resultsRoutes);
  app.use('/api/samples', samplesRoutes);
  server = http.createServer(app);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => {
  server.close();
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const asOperator = () => { currentUser = { id: operatorId, role: 'operator' }; };
const asOwner = () => { currentUser = { id: ownerId, role: 'owner' }; };
const getJson = async (url) => (await fetch(base + url)).json();

function parseCsv(text) {
  const rows = text.replace(/^﻿/, '').split('\r\n').filter(Boolean).map(l => l.split(','));
  const header = rows.shift();
  return { header, rows };
}

const EXPECTED = { over: 'fail', under: 'ok', missing: 'pending' };
const EXPECTED_LABEL = { over: 'Depasire limita', under: 'Conform', missing: 'In asteptare' };

for (const [roleName, setRole, archiveUrl, exportUrl] of [
  ['operator', asOperator, '/api/results/archive', '/api/results/archive/export'],
  ['beneficiar', asOwner, '/api/samples/archive', '/api/samples/archive/export'],
]) {
  for (const a of ANALYTES) {
    test(`arhiva ${roleName}: ${a.key.toUpperCase()} este evaluat (peste/sub limită/lipsă)`, async () => {
      setRole();
      const { samples } = await getJson(`${archiveUrl}?pageSize=200`);
      for (const kind of ['over', 'under', 'missing']) {
        const row = samples.find(s => s.code === codes[`${a.key}:${kind}`]);
        assert.ok(row, `proba ${kind} lipsește din arhivă`);
        assert.equal(row.status, EXPECTED[kind], `${a.key} ${kind}`);
      }
    });

    test(`export CSV ${roleName}: ${a.key.toUpperCase()} are coloane și status corect`, async () => {
      setRole();
      const res = await fetch(base + exportUrl);
      assert.equal(res.status, 200);
      const { header, rows } = parseCsv(await res.text());
      const iVal = header.indexOf(a.header), iLim = header.indexOf(a.limitHeader), iCode = header.indexOf('Cod probă'), iStat = header.indexOf('Status');
      assert.ok(iVal >= 0 && iLim >= 0, 'coloanele analitului lipsesc');
      for (const kind of ['over', 'under', 'missing']) {
        const row = rows.find(r => r[iCode] === codes[`${a.key}:${kind}`]);
        assert.ok(row, `proba ${kind} lipsește din export`);
        assert.equal(row[iStat], EXPECTED_LABEL[kind]);
        assert.equal(row[iVal], kind === 'missing' ? '' : String(a[kind]));
        assert.equal(row[iLim], String(a.limit));
      }
    });
  }
}

test('arhiva operator: starea din arhivă coincide cu cea din coadă pentru toate probele', async () => {
  asOperator();
  const { samples: queue } = await getJson('/api/results/queue');
  const { samples: archive } = await getJson('/api/results/archive?pageSize=200');
  const queueStatus = Object.fromEntries(queue.map(s => [s.code, s.status]));
  assert.ok(archive.length >= 13);
  for (const s of archive) assert.equal(s.status, queueStatus[s.code], s.code);
});

test('probă cu QC respins rămâne „anulată” în arhivă (operator și beneficiar)', async () => {
  asOperator();
  let { samples } = await getJson('/api/results/archive?pageSize=200');
  assert.equal(samples.find(s => s.code === codes.cancelled).status, 'cancelled');
  asOwner();
  ({ samples } = await getJson('/api/samples/archive?pageSize=200'));
  assert.equal(samples.find(s => s.code === codes.cancelled).status, 'cancelled');
});

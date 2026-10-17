// Detectarea unei tendinte crescatoare intr-un istoric de rezultate ale
// aceluiasi beneficiar, pentru aceeasi categorie si acelasi contaminant -
// gandit pentru cazul unui produs depozitat, unde o crestere constanta,
// chiar daca proba curenta ramane conforma, poate semnala un risc de
// deteriorare pe durata depozitarii (Reg. de punere in aplicare (UE)
// 2023/2782 documenteaza distributia eterogena a micotoxinelor in lot;
// aici tratam eterogenitatea in TIMP, nu doar in spatiul lotului).
//
// Metoda: testul Mann-Kendall, neparametric, folosit pe scara larga in
// monitorizarea calitatii mediului/apei pentru exact acest tip de problema
// - serii scurte, posibil zgomotoase, fara ipoteza de normalitate a datelor.
// NU e un heuristic de tipul "ultima valoare a fost mai mare ca precedenta".

const MIN_POINTS_FOR_TEST = 5; // sub acest prag, testul nu are putere reala
const Z_THRESHOLD = 1.645; // unilateral, ~95% incredere, pt crestere
const MIN_FRACTION_OF_LIMIT = 0.25; // evitam alerte pe valori nesemnificative

function mannKendall(values) {
  const n = values.length;
  if (n < MIN_POINTS_FOR_TEST) return { s: 0, z: 0, n, significant: false };
  let s = 0;
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      s += Math.sign(values[j] - values[i]);
    }
  }
  const counts = {};
  for (const v of values) counts[v] = (counts[v] || 0) + 1;
  let tieCorrection = 0;
  for (const c of Object.values(counts)) {
    if (c > 1) tieCorrection += c * (c - 1) * (2 * c + 5);
  }
  const varS = (n * (n - 1) * (2 * n + 5) - tieCorrection) / 18;
  let z = 0;
  if (s > 0) z = (s - 1) / Math.sqrt(varS);
  else if (s < 0) z = (s + 1) / Math.sqrt(varS);
  return { s, z: Number(z.toFixed(3)), n, significant: z > Z_THRESHOLD };
}

// Primeste un istoric [{value, limit}, ...] pentru UN contaminant (ordonat
// cronologic), returneaza null daca nu se poate face o afirmatie, sau un
// obiect cu detaliile testului daca exista o tendinta crescatoare reala.
function detectIncreasingTrend(history) {
  const usable = history.filter(h => h.value !== null && h.value !== undefined && h.limit);
  if (usable.length < MIN_POINTS_FOR_TEST) return null;
  const values = usable.map(h => h.value);
  const latest = usable[usable.length - 1];
  const latestFraction = latest.value / latest.limit;
  if (latestFraction < MIN_FRACTION_OF_LIMIT) return null;
  const test = mannKendall(values);
  if (!test.significant) return null;
  return { ...test, latestValue: latest.value, latestLimit: latest.limit, latestFractionOfLimit: Number(latestFraction.toFixed(3)) };
}

module.exports = { mannKendall, detectIncreasingTrend, MIN_POINTS_FOR_TEST };

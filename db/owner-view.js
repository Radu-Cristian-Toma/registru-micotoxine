// Etapa D2 (O1): beneficiarul nu vede valori, verdict sau istoric de valori înainte de validarea probei.
// Documentația spune că buletinul se arată numai după validare; până acum lista, arhiva, detaliul,
// auditul și versiunile le dădeau beneficiarului valorile introduse și un „Conform / Depășire” preliminar.
// Mascarea se face pe server (nu doar în interfață). Personalul nu este afectat.
const VALUE_KEYS = ['afb1', 'afb2', 'afg1', 'afg2', 'ota', 'm1', 'don', 'zea', 'fum'];

const isValidated = (row) => row && row.validationStatus === 'validated';

// Rând de probă (cu alias-urile din rutele beneficiarului): valorile, verdictul și observațiile
// operatorului se ascund până la validare; stadiul și motivul unei respingeri rămân vizibile.
function maskForOwner(row) {
  if (!row || isValidated(row)) return row;
  const out = { ...row };
  for (const k of VALUE_KEYS) if (k in out) out[k] = null;
  if ('notes' in out) out.notes = null;
  if (out.status === 'ok' || out.status === 'fail') out.status = 'in_analysis';
  return out;
}

// Intrări de audit: până la validare beneficiarul vede acțiunea și momentul, nu conținutul.
function maskAuditForOwner(rows, validated) {
  return validated ? rows : rows.map(r => ({ ...r, details: null }));
}

module.exports = { maskForOwner, maskAuditForOwner, VALUE_KEYS };

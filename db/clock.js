// Marcaje temporale uniforme (etapa C3, L19): ora locala a serverului, format
// „AAAA-LL-ZZ HH:MM:SS", identic cu datetime('now','localtime') din SQLite.
// Fusul orar al serverului este inregistrat in app_meta la prima pornire.
function nowLocal() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
module.exports = { nowLocal };

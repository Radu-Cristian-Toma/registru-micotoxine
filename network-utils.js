const os = require('os');

// Gaseste cea mai buna adresa IPv4 de retea locala pentru un dispozitiv
// extern (telefon) sa poata contacta acest server - folosita la generarea
// codurilor QR, unde "localhost" sau adresa cu care s-a conectat clientul
// curent ar fi inutile de pe alt dispozitiv.
//
// Masinile reale (in special macOS) au adesea MAI MULTE interfete
// non-interne simultan - utun0/utun1 (iCloud Private Relay, VPN), awdl0
// (Apple Wireless Direct Link), pe langa adaptorul WiFi/Ethernet real.
// Alegerea "ultimei interfete gasite", fara nicio prioritizare, alege des
// gresit un tunel virtual, inaccesibil de pe alt dispozitiv - preferam
// explicit adaptoare cu nume tipic fizic, ignorand tunelurile cunoscute.
const VIRTUAL_IFACE_PATTERN = /^(utun|tun|tap|awdl|llw|bridge|docker|veth|vmnet|vboxnet|zt|wg)/i;

function findLanAddress() {
  const interfaces = os.networkInterfaces();
  let preferred = null;
  let anyExternal = null;
  Object.entries(interfaces).forEach(([name, ifaceList]) => {
    (ifaceList || []).forEach(iface => {
      if (iface.family !== 'IPv4' || iface.internal) return;
      anyExternal = { name, address: iface.address };
      if (!VIRTUAL_IFACE_PATTERN.test(name)) preferred = { name, address: iface.address };
    });
  });
  return preferred || anyExternal; // null daca nu exista nicio interfata externa
}

module.exports = { findLanAddress };

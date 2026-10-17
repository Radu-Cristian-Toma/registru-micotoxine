// Adresa de ascultare a serverului. Implicit doar local (127.0.0.1);
// LIMS_HOST o poate schimba explicit (documentat in README).
const HOST = (process.env.LIMS_HOST || '').trim() || '127.0.0.1';

module.exports = { HOST };

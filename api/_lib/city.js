// Which city an account is limited to. A cosmetician works in one clinic and sees only its city
// (calendar, payments, pipeline, contacts); reception (one receptionist for both clinics) and the
// owner see both. Returns 'Timișoara' / 'Arad', or null for "both".

const CITIES = ['Timișoara', 'Arad'];

async function cityOf(session, readJSON, employees) {
  if (!session || session.role !== 'cosmetician') return null;
  const list = employees || await readJSON('data/employees.json', []);
  const me = list.find((e) => e.id === session.employeeId);
  return me && CITIES.includes(me.location) ? me.location : null;
}

// Rows with no city set (e.g. imported contacts) stay visible to everyone.
const inCity = (city, location) => !city || !location || location === city;

module.exports = { CITIES, cityOf, inCity };

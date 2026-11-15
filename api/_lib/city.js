// Which cities an account is limited to. A cosmetician works in one clinic and sees only its city (calendar, payments,
// pipeline, contacts); the manager (15.11) sees the clinics she manages, an explicit list on her record (`manages`: a
// clinic opened later never shows up for her by itself); reception (one receptionist for both clinics) and the owner
// see everything. cityOf returns 'Timișoara' / 'Arad' for a cosmetician, the list for a manager, or null for "all".

const CITIES = ['Timișoara', 'Arad'];
const { managesOf } = require('./roles');

async function cityOf(session, readJSON, employees) {
  if (!session || (session.role !== 'cosmetician' && session.role !== 'manager')) return null;
  const list = employees || await readJSON('data/employees.json', []);
  const me = list.find((e) => e.id === session.employeeId);
  if (session.role === 'manager') return managesOf(me);
  return me && CITIES.includes(me.location) ? me.location : null;
}

// Rows with no city set (e.g. imported contacts) stay visible to everyone. `city`: one city, a list, or null (all).
const inCity = (city, location) => !city || !location || (Array.isArray(city) ? city.includes(location) : location === city);

module.exports = { CITIES, cityOf, inCity };

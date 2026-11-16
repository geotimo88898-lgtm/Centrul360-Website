// The roles of the portal, in one place. `admin` stays the owner (isAdmin everywhere keeps meaning that). `manager` (the
// owner, 15.11) runs both clinics: everything reception does, on both cities, plus the team's schedule, the pontaj and
// leave approvals, the clinics' documents (Acte și autorizații) and her own Manager page. Never the owner's money (profit,
// costs, salaries, ad spend), the commissions, the ads, the settings.

const ROLES = ['receptie', 'cosmetician', 'manager', 'admin'];
// the front desk: works the pipeline, the calendar, the payments, the tasks
const FRONT = ['admin', 'receptie', 'manager'];

const isOwnerAdmin = (s) => !!s && s.role === 'admin';
const isManager = (s) => !!s && s.role === 'manager';
// may run the team (schedule, pontaj, leave, documents): the owner or the manager
const canManage = (s) => !!s && (s.role === 'admin' || s.role === 'manager');
const isFront = (s) => !!s && FRONT.includes(s.role);
// the reception role and the manager: both get what reception gets (alerts, tasks), the manager on both cities
const deskRole = (r) => r === 'receptie' || r === 'manager';

// the session if the owner or the manager, else a 401 / 403 and null
async function requireManage(req, res) {
  return require('./auth').requireRole(req, res, ['admin', 'manager']);
}

// the clinics a manager runs: the explicit list on her record (Echipa → Clinicile ei), set when she became manager
// (the clinics of that day). A clinic opened later is never added by itself.
const CLINICS = ['Timișoara', 'Arad'];
const managesOf = (e) => {
  const m = e && Array.isArray(e.manages) ? e.manages.filter((c) => typeof c === 'string' && c) : null;
  return m && m.length ? m : CLINICS.slice(); // an old record without the list: the clinics there were when the role came
};
// does this person hear about / see this city: a manager only for her clinics (no city: yes), everyone else as before
const managesCity = (e, loc) => !e || e.role !== 'manager' || !loc || managesOf(e).includes(loc);

// the ids of the active managers of a city (they hear what reception hears, for the clinics they run)
const managerIds = (employees, loc) => (employees || []).filter((e) => e && e.active !== false && e.role === 'manager' && managesCity(e, loc)).map((e) => e.id);

// the people a manager runs: everyone (not the owners, not herself) whose clinic is one of hers. null for the owner (all).
async function teamOf(session, readJSON, employees) {
  if (!isManager(session)) return null;
  const list = employees || await readJSON('data/employees.json', []);
  const me = list.find((e) => e.id === session.employeeId);
  const mine = managesOf(me);
  return new Set(list.filter((e) => e && e.id && e.id !== 'admin' && e.role !== 'admin' && e.id !== session.employeeId && mine.includes(require('./clinic').clinicOf(e.location))).map((e) => e.id)); // „Timisoara” too
}

module.exports = { teamOf, ROLES, FRONT, CLINICS, isOwnerAdmin, isManager, canManage, isFront, deskRole, requireManage, managerIds, managesOf, managesCity };

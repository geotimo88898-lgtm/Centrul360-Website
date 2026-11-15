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

// the ids of the active managers (they hear what reception hears, on both cities)
const managerIds = (employees) => (employees || []).filter((e) => e && e.active !== false && e.role === 'manager').map((e) => e.id);

module.exports = { ROLES, FRONT, isOwnerAdmin, isManager, canManage, isFront, deskRole, requireManage, managerIds };

// Roles (v22). A Director has full rights on the whole system, every Manager right included, and manages the
// Managers: only a Director (or root) gives or changes the Director role and changes a Director's account.
// Root (v23) is not part of the company: accounts in ROOT_EMAILS only configure the system (who holds which role),
// never see the company's work, and are hidden from every list of people.
export const ROLES = ['director', 'manager', 'leader', 'member']; // the roles given in the app; root comes from ROOT_EMAILS
export const isRoot = (user) => user.role === 'root';
export const isDirector = (user) => user.role === 'director';
// Manager-level rights (user administration, every project in view, channels…): Managers and Directors.
export const isManager = (user) => user.role === 'manager' || user.role === 'director';
// Who changes people's roles, status and teams: Managers, Directors and root.
export const isUserAdmin = (user) => isManager(user) || isRoot(user);

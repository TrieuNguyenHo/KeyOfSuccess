// Roles (v22). A Director has full rights on the whole system, every Manager right included, and manages the
// Managers: only a Director gives or changes the Director role and changes a Director's account.
export const ROLES = ['director', 'manager', 'leader', 'member'];
export const isDirector = (user) => user.role === 'director';
// Manager-level rights (user administration, every project in view, channels…): Managers and Directors.
export const isManager = (user) => user.role === 'manager' || user.role === 'director';

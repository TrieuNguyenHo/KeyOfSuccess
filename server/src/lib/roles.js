// Root (v23) is not part of the company: accounts in ROOT_EMAILS only configure the system (roles, what each may do,
// who holds which), never see the company's work, and are hidden from every list of people. What the other roles
// may do lives in the database (lib/permissions.js, v24).
export const isRoot = (user) => user.role === 'root';

import { createContext } from 'react';

// The signed-in user, provided by Workspace, for components deep in the tree (comment and file actions).
export const CurrentUser = createContext(null);

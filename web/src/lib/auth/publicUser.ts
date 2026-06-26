/** The user shape safe to send to the client (no internal/audit fields). */
import type { AuthUser, Role } from './types';

export interface PublicUser {
  id: string;
  mobile: string;
  name?: string;
  role: Role;
  clubTier?: AuthUser['clubTier'];
}

export function publicUser(user: AuthUser): PublicUser {
  return {
    id: user.id,
    mobile: user.mobile,
    name: user.name,
    role: user.role,
    clubTier: user.clubTier,
  };
}

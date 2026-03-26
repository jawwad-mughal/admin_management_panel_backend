import { AuthenticatedRequest } from "./authMiddleware";

export const hasPermission = (
  req: AuthenticatedRequest,
  permission: string
): boolean => {
  if (!req.user) return false;

  // ✅ Admin bypass
  if (req.user.permissions.includes("admin:full_access")) {
    return true;
  }

  return req.user.permissions.includes(permission);
};
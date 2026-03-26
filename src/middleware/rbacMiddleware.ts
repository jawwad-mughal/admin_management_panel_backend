import { Request, Response, NextFunction } from "express";
import { User } from "../models/User";
import { AuthenticatedRequest as AuthenticatedReqFromAuth } from "./authMiddleware";

export type AuthenticatedRequest = AuthenticatedReqFromAuth;

const rolePermissions: Record<string, string[]> = {
  Admin: [
    "admin:full_access",
    "products:read","products:create","products:update","products:delete",
    "categories:read","categories:create","categories:update","categories:delete",
    "orders:read","orders:create","orders:update","orders:delete",
    "users:read","users:create","users:update","users:delete",
    "branches:read","branches:create","branches:update","branches:delete",
    "reports:read","reports:create","reports:update","reports:delete"
  ],
  BranchManager: [
    "products:read","products:create","products:update","products:delete",
    "categories:read","categories:create","categories:update","categories:delete",
    "orders:read","orders:create","orders:update","orders:delete",
    "users:read","users:create","users:update","users:delete",
    "branches:read","branches:update",
    "reports:read"
  ],
  Employee: [
    "products:read",
    "categories:read",
    "orders:read","orders:create","orders:update",
    "branches:read",
    "reports:read"
  ],
  User: [
    "products:read",
    "categories:read",
    "orders:read"
  ]
};

const getPermissions = (req: AuthenticatedRequest): string[] => {
  if (!req.user) return [];

  const rolePerms = rolePermissions[req.user.role] || [];
  const userPerms = req.user.permissions || [];

  const mergedPerms = Array.from(new Set([...rolePerms, ...userPerms]));
  return mergedPerms;
};

// Check if user has required permission
export const requirePermission = (permission: string) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const permissions = getPermissions(req);

      // Admin has full access
      if (req.user.role === "Admin" || permissions.includes("admin:full_access")) {
        return next();
      }

      // Check if user has the required permission
      if (!permissions.includes(permission)) {
        console.log("❌ Permission denied");
        return res.status(403).json({
          message: "Insufficient permissions",
          required: permission,
          userPermissions: permissions
        });
      }

      console.log("✅ Permission granted");
      next();
    } catch (error) {
      console.error("Permission check error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  };
};

// Check if user has any of the required permissions
export const requireAnyPermission = (permissions: string[]) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const userPermissions = getPermissions(req);

      // Admin has full access
      if (req.user.role === "Admin" || userPermissions.includes("admin:full_access")) {
        return next();
      }

      // Check if user has any of the required permissions
      const hasPermission = permissions.some(permission => userPermissions.includes(permission));
      if (!hasPermission) {
        return res.status(403).json({
          message: "Insufficient permissions",
          required: permissions
        });
      }

      next();
    } catch (error) {
      console.error("Permission check error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  };
};

// Branch manager or employee specific middleware - only access their own branch
export const requireBranchAccess = () => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const permissions = getPermissions(req);

      // Admin has access to all branches
      if (req.user.role === "Admin" || permissions.includes("admin:full_access")) {
        return next();
      }

      // Branch managers and employees can only access their own branch
      if ((req.user.role === "BranchManager" || req.user.role === "Employee")) {
        // Check if user has a branch assigned
        if (!req.user.branch) {
          return res.status(403).json({
            message: "Access denied: No branch assigned to your account. Please contact administrator to assign you to a branch.",
            code: "BRANCH_NOT_ASSIGNED",
            userRole: req.user.role,
            userEmail: req.user.email
          });
        }

        // Normalize branch ids
        const normalizeBranchId = (branch: any): string | null => {
          if (!branch) return null;
          if (typeof branch === "string") return branch;
          if (branch._id) return branch._id.toString();
          if (typeof branch.toString === "function") return branch.toString();
          return null;
        };

        const userBranchId = normalizeBranchId(req.user.branch);
        const branchId = normalizeBranchId((req.body && req.body.branch) || req.query.branch);

        if (branchId && userBranchId && branchId !== userBranchId) {
          return res.status(403).json({
            message: "Access denied: Can only access your own branch"
          });
        }

        // For resource-by-ID routes (products/categories/orders), controllers do branch check.
        return next();
      }

      // Other roles don't have branch-specific restrictions beyond permissions
      next();
    } catch (error) {
      console.error("Branch access check error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  };
};

// Admin only middleware
export const requireAdmin = () => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const permissions = getPermissions(req);
      if (req.user.role !== "Admin" && !permissions.includes("admin:full_access")) {
        return res.status(403).json({ message: "Admin access required" });
      }

      next();
    } catch (error) {
      console.error("Admin check error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  };
};

// Branch manager or admin middleware
export const requireBranchManagerOrAdmin = () => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Authentication required" });
      }

      if (req.user.role !== "Admin" && req.user.role !== "BranchManager" && !req.user.permissions.includes("admin:full_access")) {
        return res.status(403).json({ message: "Branch manager or admin access required" });
      }

      next();
    } catch (error) {
      console.error("Branch manager check error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  };
};
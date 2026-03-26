import express from "express";
import {
  getCurrentUserProfile,
  createUser,
  deleteUser,
  getAllUsers,
  getUserById,
  updateUser,
  getUserPermissions,
  updateUserPermissions,
  updateCurrentUserProfile,
  changeCurrentUserPassword
} from "../controllers/userController";
import { authMiddleware } from "../middleware/authMiddleware";
import {
  requirePermission,
  requireAdmin,
  requireBranchAccess
} from "../middleware/rbacMiddleware";

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

// Get current user profile
router.get("/profile", getCurrentUserProfile);

// Update current user profile
router.put("/profile", updateCurrentUserProfile);

// Change current user password
router.put("/change-password", changeCurrentUserPassword);

// Get all users - requires read permission
router.get("/getall", requirePermission("users:read"), getAllUsers);

// Get single user - requires read permission and branch access for branch managers
router.get("/get/:id", requirePermission("users:read"), requireBranchAccess(), getUserById);

// Create user - requires create permission
router.post("/create", requirePermission("users:create"), createUser);

// Update user - requires update permission and branch access for branch managers
router.put("/update/:id", requirePermission("users:update"), requireBranchAccess(), updateUser);

// Delete user - requires delete permission and branch access for branch managers
router.delete("/delete/:id", requirePermission("users:delete"), requireBranchAccess(), deleteUser);

// Get user permissions - users can view their own, admins can view all
router.get("/permissions/:id", getUserPermissions);

// Update user permissions - admin only
router.put("/permissions/:id", requireAdmin(), updateUserPermissions);

export default router;
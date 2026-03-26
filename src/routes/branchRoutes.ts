import { Router } from "express";
import {
  createBranch,
  getBranches,
  getBranchById,
  updateBranch,
  deleteBranch,
  getBranchDashboard,
  getDeletedBranches,
  restoreBranch,
} from "../controllers/branchController";
import { authMiddleware } from "../middleware/authMiddleware";
import { requirePermission, requireBranchAccess } from "../middleware/rbacMiddleware";

const router = Router();

// All routes require authentication
router.use(authMiddleware);

router.post("/create", requirePermission("branches:create"), createBranch);
router.get("/all", requirePermission("branches:read"), getBranches);
router.get("/trash", requirePermission("branches:read"), getDeletedBranches); // ✅ move before /:id
router.get("/:id/dashboard", requirePermission("branches:read"), getBranchDashboard);
router.get("/:id", requirePermission("branches:read"), requireBranchAccess(), getBranchById);
router.put("/:id", requirePermission("branches:update"), requireBranchAccess(), updateBranch);
router.put("/:id/restore", requirePermission("branches:create"), restoreBranch);
router.delete("/:id", requirePermission("branches:delete"), requireBranchAccess(), deleteBranch);

export default router;
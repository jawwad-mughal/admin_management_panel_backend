import { Router } from "express"
import { createCategory, deleteCategory, getAllCategories, getCategoryById, updateCategory } from "../controllers/categoryController"
import { authMiddleware } from "../middleware/authMiddleware";
import { requirePermission, requireBranchAccess } from "../middleware/rbacMiddleware";

const router = Router()

// All routes require authentication
router.use(authMiddleware);

router.post("/create", requirePermission("categories:create"), createCategory)
router.get("/all", requirePermission("categories:read"), getAllCategories)
router.get("/:id", requirePermission("categories:read"), requireBranchAccess(), getCategoryById);           // Get single category
router.put("/:id", requirePermission("categories:update"), requireBranchAccess(), updateCategory);            // Update category
router.delete("/:id", requirePermission("categories:delete"), requireBranchAccess(), deleteCategory);
export default router
import { Router } from "express";
import {
  createProduct,
  getAllProducts,
  getSingleProduct,
  updateProduct,
  deleteProduct,
} from "../controllers/productController";

import upload from "../middleware/upload";
import { authMiddleware } from "../middleware/authMiddleware";
import { requirePermission, requireBranchAccess } from "../middleware/rbacMiddleware";

const router = Router();

// All routes require authentication
router.use(authMiddleware);

/* CREATE */
router.post("/create", requirePermission("products:create"), upload.single("image"), createProduct);

/* READ */
router.get("/all", requirePermission("products:read"), getAllProducts);
router.get("/:id", requirePermission("products:read"), requireBranchAccess(), getSingleProduct);

/* UPDATE */
router.put("/update/:id", requirePermission("products:update"), requireBranchAccess(), upload.single("image"), updateProduct);

/* DELETE */
router.delete("/delete/:id", requirePermission("products:delete"), requireBranchAccess(), deleteProduct);

export default router;
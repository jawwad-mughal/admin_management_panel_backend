import { Router } from "express";
import {
  createOrder,
  deleteOrder,
  getAllOrders,
  getOrderById,
  updateOrderStatus,
} from "../controllers/orderController";
import { authMiddleware } from "../middleware/authMiddleware";
import { requirePermission, requireBranchAccess } from "../middleware/rbacMiddleware";

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// ✅ Create new order
router.post("/create", requirePermission("orders:create"), createOrder);

// ✅ Get all orders
router.get("/all", requirePermission("orders:read"), getAllOrders);

// ✅ Get single order
router.get("/:id", requirePermission("orders:read"), requireBranchAccess(), getOrderById);

// ✅ Update order status
router.put("/:id/status", requirePermission("orders:update"), requireBranchAccess(), updateOrderStatus);

router.delete("/delete/:id", requirePermission("orders:delete"), requireBranchAccess(), deleteOrder);

export default router;
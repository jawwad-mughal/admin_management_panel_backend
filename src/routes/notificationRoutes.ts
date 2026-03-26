import { Router } from "express";
import { authMiddleware } from "../middleware/authMiddleware";
import { getNotifications, markAllNotificationsRead } from "../controllers/notificationController";
import { requirePermission } from "../middleware/rbacMiddleware";

const router = Router();

router.use(authMiddleware);

router.get("/", requirePermission("orders:read"), getNotifications);
router.put("/mark-read", requirePermission("orders:read"), markAllNotificationsRead);

export default router;

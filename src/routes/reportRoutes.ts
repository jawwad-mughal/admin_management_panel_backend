import { Router } from "express";
import { getReports } from "../controllers/reportController";
import { authMiddleware } from "../middleware/authMiddleware";
import { requirePermission } from "../middleware/rbacMiddleware";

const router = Router();

// All routes require authentication
router.use(authMiddleware);

router.get("/", requirePermission("reports:read"), getReports);

export default router;
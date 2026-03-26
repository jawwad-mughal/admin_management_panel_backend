import express from "express";
import {
  signup,
  login,
  logout,
  verifyToken,
  forgotPassword,
  resetPassword,
  refreshToken
} from "../controllers/authController";

import { authMiddleware } from "../middleware/authMiddleware";

const router = express.Router();

// Auth
router.post("/signup", signup);
router.post("/login", login);
router.post("/logout", authMiddleware, logout);

// Token refresh
router.post("/refresh-token", refreshToken);

// Token verify
router.get("/verifytoken", authMiddleware, verifyToken);

// Forgot password
router.post("/forgot-password", forgotPassword);

// Reset password
router.post("/reset-password/:token", resetPassword);

export default router;
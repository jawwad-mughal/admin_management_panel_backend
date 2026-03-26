import { Request, Response } from "express";
import { User } from "../models/User";
import { Admin } from "../models/admin";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { sendEmail } from "../utils/sendEmail";

const JWT_SECRET = process.env.JWT_SECRET!;
const REFRESH_TOKEN_SECRET =
  process.env.REFRESH_TOKEN_SECRET || "refresh-secret-key";

// 🔐 Generate Access Token (15 minutes) - Include user data
const normalizeBranch = (branch: any) => {
  if (!branch) return undefined;
  if (typeof branch === "string") return branch;
  if (branch._id) return branch._id.toString();
  if (typeof branch.toString === "function") return branch.toString();
  return undefined;
};

const generateAccessToken = (user: any) => {
  return jwt.sign(
    {
      id: user._id.toString(),
      _id: user._id.toString(),
      email: user.email,
      role: user.role,
      permissions: user.permissions || [],
      branch: normalizeBranch(user.branch),
      admin: user.admin ? user.admin.toString() : user._id.toString(),
    },
    JWT_SECRET,
    { expiresIn: "15m" },
  );
};

// 🔄 Generate Refresh Token (7 days)
const generateRefreshToken = (user: any) => {
  return jwt.sign(
    {
      id: user._id.toString(),
      _id: user._id.toString(),
      email: user.email,
      role: user.role,
      permissions: user.permissions || [],
      branch: normalizeBranch(user.branch),
      admin: user.admin ? user.admin.toString() : user._id.toString(),
    },
    REFRESH_TOKEN_SECRET,
    { expiresIn: "7d" },
  );
};

// ================= SIGNUP =================
export const signup = async (req: Request, res: Response) => {
  try {
    const { name, email, password, phone, countryCode, dialCode, flag } =
      req.body;

    if (
      !name ||
      !email ||
      !password ||
      !phone ||
      !countryCode ||
      !dialCode ||
      !flag
    ) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const userExists = await User.findOne({ email });
    if (userExists)
      return res.status(400).json({ message: "User already exists" });

    const hashed = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      password: hashed,
      phone,
      countryCode,
      dialCode,
      flag,
      role: "Admin",
      permissions: ["admin:full_access"],
    });

    // Set admin to self for new admin users
    user.admin = user._id;
    await user.save();

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Store refresh token in user document
    user.refreshToken = refreshToken;
    await user.save();

    res.cookie("accessToken", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production", // HTTPS on Vercel
      sameSite: "none", // cross-origin required
      maxAge: 15 * 60 * 1000,
    });

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "none",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    const userWithoutPassword = {
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      countryCode: user.countryCode,
      dialCode: user.dialCode,
      flag: user.flag,
      role: user.role,
      permissions: user.permissions,
    };

    res.status(201).json({
      message: "Signup successful",
      user: userWithoutPassword,
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// ================= LOGIN =================
export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    // Check User collection first, then Admin collection
    let user: any = await User.findOne({ email, status: "Active" });
    if (!user) {
      user = await Admin.findOne({ email });
      // Admin model does not include status field, but we can assume active if found
    }

    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // Define role-based permissions
    const rolePerms: Record<string, string[]> = {
      Admin: ["admin:full_access"],
      BranchManager: [
        "products:read",
        "products:create",
        "products:update",
        "categories:read",
        "categories:create",
        "categories:update",
        "orders:read",
        "orders:create",
        "orders:update",
        "users:read",
        "users:create",
        "users:update",
        "branches:read",
        "branches:update",
        "reports:read",
      ],
      Employee: [
        "products:read",
        "categories:read",
        "orders:read",
        "orders:create",
        "orders:update",
        "reports:read",
      ],
      User: ["products:read", "categories:read", "orders:read"],
    };

    // Ensure permissions are always assigned based on role
    if (!user.permissions || user.permissions.length === 0) {
      user.permissions = rolePerms[user.role] || [];
      await user.save();
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Store refresh token in database
    user.refreshToken = refreshToken;
    await user.save();

    res.cookie("accessToken", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production", // HTTPS on Vercel
      sameSite: "none", // cross-origin required
      maxAge: 15 * 60 * 1000,
    });

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "none",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    const userWithoutPassword: any = {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      permissions: user.permissions,
      phone: user.phone,
      countryCode: user.countryCode,
      dialCode: user.dialCode,
      flag: user.flag,
      branch: user.branch,
    };

    res.json({
      message: "Login successfully",
      user: userWithoutPassword,
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// ================= LOGOUT =================
export const logout = async (req: Request, res: Response) => {
  try {
    const tokenUser = (req as any).user;

    if (tokenUser && tokenUser.id) {
      let user: any = await User.findById(tokenUser.id);
      if (!user) user = await Admin.findById(tokenUser.id);

      if (user) {
        user.refreshToken = null;
        await user.save();
      }
    }

    res.clearCookie("accessToken", {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
    });

    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
    });

    return res.json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error);
    return res.status(500).json({ message: "Failed to logout" });
  }
};

export const verifyToken = (req: Request, res: Response) => {
  // authMiddleware se req.user attach ho gaya
  const user = (req as any).user;

  res.status(200).json({
    success: true,
    message: "Token is valid",
    user,
  });
};

// ================= REFRESH TOKEN =================
export const refreshToken = async (req: Request, res: Response) => {
  try {
    const { refreshToken: token } = req.body;

    if (!token) {
      return res.status(401).json({ message: "Refresh token required" });
    }

    // Verify refresh token
    const decoded: any = jwt.verify(token, REFRESH_TOKEN_SECRET);

    // Find user and validate stored refresh token (support both User and Admin collections)
    let user: any = await User.findById(decoded.id);
    if (!user) {
      user = await Admin.findById(decoded.id);
    }

    if (!user || user.refreshToken !== token) {
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    // Generate new access token with user data
    const newAccessToken = generateAccessToken(user);

    // Generate new refresh token
    const newRefreshToken = generateRefreshToken(user);
    user.refreshToken = newRefreshToken;
    await user.save();

    res.cookie("accessToken", newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 15 * 60 * 1000, // 15 minutes
    });

    res.cookie("refreshToken", newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.json({
      message: "Access token refreshed",
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (error: any) {
    if (error.name === "TokenExpiredError") {
      return res
        .status(401)
        .json({ message: "Refresh token expired. Please login again" });
    }
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ message: "Invalid refresh token" });
    }
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// ================= FORGOT PASSWORD =================
export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    // Check User collection first, then Admin collection
    let user: any = await User.findOne({ email, status: "Active" });
    if (!user) {
      user = await Admin.findOne({ email });
    }

    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");

    user.resetToken = resetToken;
    user.resetTokenExpire = new Date(Date.now() + 10 * 60 * 1000);

    await user.save();

    const baseUrl = process.env.APP_URL || "http://localhost:3000";
    const resetLink = `${baseUrl}/reset-password/${resetToken}`;

    await sendEmail(
      email,
      "Reset Your Password",
      `
      <h2>Password Reset</h2>
      <p>Click the button below to reset your password</p>

      <a href="${resetLink}" 
      style="padding:10px 20px;background:#2563eb;color:white;text-decoration:none;border-radius:5px">
      Reset Password
      </a>

      <p>This link will expire in 10 minutes.</p>
      `,
    );

    res.json({
      message: "Reset link sent to your email",
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Server error" });
  }
};

// ================= RESET PASSWORD =================
export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    // Check User collection
    const user = await User.findOne({
      resetToken: token,
      resetTokenExpire: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({ message: "Token invalid or expired" });
    }

    const hashed = await bcrypt.hash(password, 10);

    user.password = hashed;
    user.resetToken = undefined;
    user.resetTokenExpire = undefined;

    await user.save();

    res.json({
      message: "Password reset successful",
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Server error" });
  }
};

import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { User } from "../models/User";
import { Admin } from "../models/admin";
import { AuthenticatedRequest } from "../middleware/authMiddleware";

// Helper to get permissions from role fallback
const getPermissions = (req: AuthenticatedRequest): string[] => {
  if (!req.user) return [];
  if (req.user.permissions && req.user.permissions.length > 0) {
    return req.user.permissions;
  }
  // Fallback permissions based on role
  const rolePerms: Record<string, string[]> = {
    Admin: ["admin:full_access"],
    BranchManager: [
      // User management
      "users:read", "users:create", "users:update",
      // Product management
      "products:read", "products:create", "products:update",
      // Category management
      "categories:read", "categories:create", "categories:update",
      // Order management
      "orders:read", "orders:create", "orders:update",
      // Branch management
      "branches:read", "branches:update",
      // Reports
      "reports:read"
    ],
    Employee: [
      // Product access
      "products:read",
      // Category access
      "categories:read",
      // Order management
      "orders:read", "orders:create", "orders:update",
      // Reports
      "reports:read"
    ],
    User: [
      // Read-only access
      "products:read",
      "categories:read",
      "orders:read",
      "reports:read"
    ]
  };
  return rolePerms[req.user.role] || [];
};

// GET CURRENT USER PROFILE
export const getCurrentUserProfile = async (req: AuthenticatedRequest, res: Response) => {
  try {
    let user: (typeof User | typeof Admin) | null = await User.findById(req.user?.id)
      .select('-password')
      .populate('branch', 'name') as any;

    // If user not found in User collection, try Admin collection (separate admin model)
    if (!user) {
      user = await Admin.findById(req.user?.id)
        .select('-password') as any;
    }

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const role = (user as any).role || "User";
    const status = (user as any).status || "Active";
    const branch = (user as any).branch || null;
    const permissions = ((user as any).permissions && (user as any).permissions.length > 0)
      ? (user as any).permissions
      : getPermissions(req);

    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    res.json({
      _id: (user as any)._id,
      name: (user as any).name,
      email: (user as any).email,
      role,
      status,
      branch,
      permissions,
    });
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({ message: "Failed to fetch profile" });
  }
};

export const createUser = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { name, email, password, role, status, branch, permissions } = req.body;

    // Check if email already exists
    const exist = await User.findOne({ email });
    if (exist) {
      return res.status(400).json({
        message: "Email already exists",
      });
    }

    // Hash password
    const hash = await bcrypt.hash(password, 10);

    // Define role-based permissions
    const rolePermissions: Record<string, string[]> = {
      Admin: ["admin:full_access"],
      BranchManager: [
        "products:read", "products:create", "products:update",
        "categories:read", "categories:create", "categories:update",
        "orders:read", "orders:create", "orders:update",
        "users:read", "users:create", "users:update",
        "branches:read", "branches:update",
        "reports:read"
      ],
      Employee: ["products:read", "categories:read", "orders:read", "orders:create", "orders:update", "reports:read"],
      User: ["products:read", "categories:read", "orders:read"]
    };

    const finalRole = role || "User";
    const roleBasedPerms = rolePermissions[finalRole] || [];
    const finalPermissions = permissions && permissions.length > 0 
      ? [...new Set([...roleBasedPerms, ...permissions])] // Merge role-based + custom, remove duplicates
      : roleBasedPerms;

    // Create user with createdBy field for tracking
    const businessAdminId = (req.user as any).admin || req.user._id;

    const user = await User.create({
      name,
      email,
      password: hash,
      role: finalRole,
      status: status || "Active",
      branch,
      permissions: finalPermissions,
      createdBy: req.user?.id,
      admin: businessAdminId,
    });

    // Return user without password
    const userResponse = await User.findById(user._id).select('-password').populate('branch', 'name');

    res.json({
      message: "User Created",
      user: userResponse,
    });
  } catch (error) {
    console.error("Create user error:", error);
    res.status(500).json({ message: "Failed to create user" });
  }
};

// GET ALL USERS
export const getAllUsers = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    let query: any = {};

    if (req.user?.role === "Admin") {
      // Admin can see only users they created in their business scope
      query.admin = req.user._id;
    } else if ((req.user?.role === "BranchManager" || req.user?.role === "Employee") && req.user.branch) {
      // Branch managers and employees can only see users in their branch
      query.branch = req.user.branch;
    } else {
      // Regular users can only see their own profile (or no list)
      query._id = req.user._id;
    }

    const users = await User.find(query)
      .select('-password')
      .populate('branch', 'name')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 });

    return res.json(users);
  } catch (error) {
    console.error("Get all users error:", error);
    res.status(500).json({ message: "Failed to fetch users" });
  }
};

// GET SINGLE USER
export const getUserById = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { id } = req.params;

    const user = await User.findById(id)
      .select('-password')
      .populate('branch', 'name')
      .populate('createdBy', 'name');

    if (!user) return res.status(404).json({ message: "User not found" });

    // Branch managers and employees can only access users from their branch
    if ((req.user?.role === "BranchManager" || req.user?.role === "Employee") && req.user.branch && user.branch?.toString() !== req.user.branch.toString()) {
      return res.status(403).json({ message: "Access denied: Can only access users from your branch" });
    }

    // Admin can access only users they created
    if (req.user?.role === "Admin" && user.admin?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Access denied: Can only access your own users" });
    }

    // Regular users can only access their own profile
    if (req.user?.role === "User" && req.user._id.toString() !== id) {
      return res.status(403).json({ message: "Access denied: Cannot access other user profiles" });
    }

    // Admin can access any user

    res.json({ user });
  } catch (error) {
    console.error("Get user by ID error:", error);
    res.status(500).json({ message: "Failed to fetch user" });
  }
};

// UPDATE USER
export const updateUser = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { id } = req.params;
    const { name, email, role, status, branch, permissions } = req.body;

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Branch managers can only update users from their branch
    if (req.user?.role === "BranchManager" && req.user.branch &&
        user.branch?.toString() !== req.user.branch?.toString()) {
      return res.status(403).json({ message: "Access denied: Can only update users from your branch" });
    }

    // Branch managers can only update users from their branch
    if (req.user?.role === "BranchManager" && req.user.branch && user.branch?.toString() !== req.user.branch.toString()) {
      return res.status(403).json({ message: "Access denied: Can only update users from your branch" });
    }

    // Regular users can only update their own profile
    if (req.user?.role === "User" && req.user._id.toString() !== id) {
      return res.status(403).json({ message: "Access denied: Cannot update other user profiles" });
    }

    // Admin can update only their own users
    if (req.user?.role === "Admin" && user.admin?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Access denied: Can only update your own users" });
    }

    // Only admins can change roles and permissions
    const userPerms = getPermissions(req);
    if (req.user?.role !== "Admin" && !userPerms.includes("admin:full_access")) {
      if (role !== user.role || permissions) {
        return res.status(403).json({ message: "Only admins can change roles and permissions" });
      }
    }

    // Update fields
    if (name) user.name = name;
    if (email) user.email = email;
    if (role && (req.user?.role === "Admin" || getPermissions(req).includes("admin:full_access"))) {
      user.role = role;
    }
    if (status) user.status = status;
    if (branch) user.branch = branch;
    if (permissions && (req.user?.role === "Admin" || getPermissions(req).includes("admin:full_access"))) {
      user.permissions = permissions;
    }

    await user.save();

    const updatedUser = await User.findById(user._id)
      .select('-password')
      .populate('branch', 'name')
      .populate('createdBy', 'name');

    res.json({ message: "User updated", user: updatedUser });
  } catch (error) {
    console.error("Update user error:", error);
    res.status(500).json({ message: "Failed to update user" });
  }
};

// DELETE USER
export const deleteUser = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Branch managers can only delete users from their branch
    if (req.user?.role === "BranchManager" && req.user.branch &&
        user.branch?.toString() !== req.user.branch?.toString()) {
      return res.status(403).json({ message: "Access denied: Can only delete users from your branch" });
    }

    // Branch managers can only delete users from their branch
    if (req.user?.role === "BranchManager" && req.user.branch && user.branch?.toString() !== req.user.branch.toString()) {
      return res.status(403).json({ message: "Access denied: Can only delete users from your branch" });
    }

    // Admin can delete only their own users
    if (req.user?.role === "Admin" && user.admin?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Access denied: Can only delete your own users" });
    }

    // Regular users can only delete their own profile
    if (req.user?.role === "User" && req.user._id.toString() !== id) {
      return res.status(403).json({ message: "Access denied: Cannot delete other users" });
    }

    // Admin can delete any user

    // Prevent deleting admin users unless you're an admin
    const delPerms = getPermissions(req);
    if (user.role === "Admin" && req.user?.role !== "Admin" && !delPerms.includes("admin:full_access")) {
      return res.status(403).json({ message: "Cannot delete admin users" });
    }

    await User.findByIdAndDelete(id);

    res.json({ message: "User deleted" });
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).json({ message: "Failed to delete user" });
  }
};

// GET USER PERMISSIONS
export const getUserPermissions = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { id } = req.params;

    const user = await User.findById(id).select('role permissions');
    if (!user) return res.status(404).json({ message: "User not found" });

    // Users can view their own permissions, admins can view all
    const viewPerms = getPermissions(req);
    if (req.user?.id !== id && req.user?.role !== "Admin" && !viewPerms.includes("admin:full_access")) {
      return res.status(403).json({ message: "Access denied" });
    }

    res.json({
      role: user.role,
      permissions: user.permissions
    });
  } catch (error) {
    console.error("Get user permissions error:", error);
    res.status(500).json({ message: "Failed to fetch permissions" });
  }
};

// UPDATE CURRENT USER PROFILE
export const updateCurrentUserProfile = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { name, email } = req.body;

    let user: (typeof User | typeof Admin) | null = await User.findById(req.user?.id);

    // If user not found in User collection, try Admin collection
    if (!user) {
      user = await Admin.findById(req.user?.id);
    }

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Update fields
    if (name) (user as any).name = name;
    if (email) (user as any).email = email;

    await (user as any).save();

    res.json({
      message: "Profile updated successfully",
      user: {
        _id: (user as any)._id,
        name: (user as any).name,
        email: (user as any).email,
        role: (user as any).role,
      }
    });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({ message: "Failed to update profile" });
  }
};

// CHANGE CURRENT USER PASSWORD
export const changeCurrentUserPassword = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;

    let user: (typeof User | typeof Admin) | null = await User.findById(req.user?.id);

    // If user not found in User collection, try Admin collection
    if (!user) {
      user = await Admin.findById(req.user?.id);
    }

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check current password
    const isMatch = await bcrypt.compare(currentPassword, (user as any).password);
    if (!isMatch) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    // Hash new password
    const hash = await bcrypt.hash(newPassword, 10);
    (user as any).password = hash;

    await (user as any).save();

    res.json({ message: "Password changed successfully" });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({ message: "Failed to change password" });
  }
};

// UPDATE USER PERMISSIONS - Admin only
export const updateUserPermissions = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { permissions } = req.body;

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Only admins can update permissions
    if (req.user?.role !== "Admin") {
      return res.status(403).json({ message: "Only admins can update user permissions" });
    }

    // Update permissions
    if (permissions && Array.isArray(permissions)) {
      user.permissions = permissions;
    }

    await user.save();

    const updatedUser = await User.findById(user._id)
      .select('-password')
      .populate('branch', 'name')
      .populate('createdBy', 'name');

    res.json({ message: "User permissions updated", user: updatedUser });
  } catch (error) {
    console.error("Update user permissions error:", error);
    res.status(500).json({ message: "Failed to update user permissions" });
  }
};
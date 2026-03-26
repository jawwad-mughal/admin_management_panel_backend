import { Request, Response } from "express";
import Branch from "../models/branch";
import Order from "../models/order";
import Notification from "../models/notification";
import { AuthenticatedRequest } from "../middleware/authMiddleware";

// Helper to get permissions from role fallback
const getPermissions = (req: AuthenticatedRequest): string[] => {
  if (!req.user) return [];
  if (req.user.permissions && req.user.permissions.length > 0) {
    return req.user.permissions;
  }
  const rolePerms: Record<string, string[]> = {
    Admin: ["admin:full_access"],
    BranchManager: ["branches:read"],
    Employee: [],
    User: []
  };
  return rolePerms[req.user.role] || [];
};

// ✅ Create Branch (with restore logic)
export const createBranch = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { name, code, phone } = req.body;

    if (!name || !code || !phone) {
      return res.status(400).json({
        success: false,
        message: "Name, Code & Phone are required",
      });
    }

    // 🔥 Check if branch already exists
    const existing = await Branch.findOne({ code });

    // 👉 Restore if soft deleted
    if (existing && existing.isDeleted) {
      existing.isDeleted = false;
      Object.assign(existing, req.body);
      await existing.save();

      return res.json({
        success: true,
        message: "Branch restored successfully",
        data: existing,
      });
    }

    // 👉 Prevent duplicate active branch
    if (existing && !existing.isDeleted) {
      return res.status(400).json({
        success: false,
        message: "Branch code already exists",
      });
    }

    // 👉 Create new
    const branch = await Branch.create({ ...req.body, admin: req.user._id });

    await Notification.create({
      title: "Branch Created",
      message: `Branch ${branch.name} has been created by ${req.user?.name || "system"}.`,
      type: "branch:create",
      recipientRoles: ["Admin"],
      admin: req.user._id,
      data: { branchId: branch._id },
      readBy: [],
    });

    res.status(201).json({
      success: true,
      message: "Branch created successfully",
      data: branch,
    });
  } catch (err: any) {
    console.error("Create branch error:", err);
    
    // Handle MongoDB validation errors
    if (err.name === "ValidationError") {
      const messages = Object.values(err.errors)
        .map((e: any) => e.message)
        .join(", ");
      return res.status(400).json({ success: false, message: messages });
    }
    
    res.status(500).json({ success: false, message: "Server Error", error: err.message });
  }
};

// ✅ Get All Branches
export const getBranches = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    let query: any = { isDeleted: false };

    // Branch managers and employees can only see their own branch
    if ((req.user?.role === "BranchManager" || req.user?.role === "Employee") && req.user.branch) {
      query._id = req.user.branch;
    }

    // Admins can only see branches they created (business scope)
    if (req.user?.role === "Admin") {
      query.admin = req.user._id;
    }

    const branches = await Branch.find(query).sort({
      createdAt: -1,
    });

    res.json({
      success: true,
      data: branches,
    });
  } catch (err) {
    console.error("Get branches error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch branches" });
  }
};

// ✅ Get Single Branch
export const getBranchById = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const branch = await Branch.findById(req.params.id);

    if (!branch || branch.isDeleted) {
      return res.status(404).json({
        success: false,
        message: "Branch not found",
      });
    }

    // Branch managers and employees can only access their own branch
    if ((req.user?.role === "BranchManager" || req.user?.role === "Employee") && req.user.branch &&
        req.params.id !== req.user.branch.toString()) {
      return res.status(403).json({
        success: false,
        message: "Access denied: Can only access your own branch"
      });
    }

    // Admin can access only their own branch
    if (req.user?.role === "Admin" && branch.admin.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Access denied: Can only access your own branch"
      });
    }

    res.json({
      success: true,
      data: branch,
    });
  } catch (err) {
    console.error("Get branch by ID error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch branch" });
  }
};

// ✅ Update Branch
export const updateBranch = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    // Branch managers can only update their own branch
    if (req.user?.role === "BranchManager" && req.user.branch &&
        req.params.id !== req.user.branch) {
      return res.status(403).json({
        success: false,
        message: "Access denied: Can only update your own branch"
      });
    }

    const branch = await Branch.findById(req.params.id);

    if (!branch) {
      return res.status(404).json({ success: false, message: "Branch not found" });
    }

    // Admin can update only their own branch
    if (req.user?.role === "Admin" && branch.admin.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "Access denied: Can only update your own branch" });
    }

    if (!branch) {
      return res.status(404).json({
        success: false,
        message: "Branch not found",
      });
    }

    // Admin can update any branch (business owner scope)
    // BranchManager can only update their own branch (checked above)

    const updatedBranch = await Branch.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    await Notification.create({
      title: "Branch Updated",
      message: `Branch ${updatedBranch?.name} has been updated by ${req.user?.name || "system"}.`,
      type: "branch:update",
      recipientRoles: ["Admin"],
      admin: req.user._id,
      data: { branchId: updatedBranch?._id },
      readBy: [],
    });

    res.json({
      success: true,
      message: "Branch updated",
      data: updatedBranch,
    });
  } catch (err) {
    console.error("Update branch error:", err);
    res.status(500).json({ success: false, message: "Failed to update branch" });
  }
};

// ✅ Soft Delete Branch
export const deleteBranch = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const branch = await Branch.findById(req.params.id);

    if (!branch) {
      return res.status(404).json({
        success: false,
        message: "Branch not found",
      });
    }

    // Branch managers can only delete their own branch
    if (req.user?.role === "BranchManager" && req.user.branch &&
        req.params.id !== req.user.branch) {
      return res.status(403).json({
        success: false,
        message: "Access denied: Can only delete your own branch"
      });
    }

    // Admin can delete only their own branch
    if (req.user?.role === "Admin" && branch.admin.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Access denied: Can only delete your own branch"
      });
    }

    const deletedBranch = await Branch.findByIdAndUpdate(
      req.params.id,
      { isDeleted: true },
      { new: true }
    );

    res.json({
      success: true,
      message: "Branch deleted (soft)",
    });
  } catch (err) {
    console.error("Delete branch error:", err);
    res.status(500).json({ success: false, message: "Failed to delete branch" });
  }
};

// ✅ Branch Dashboard
export const getBranchDashboard = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { id } = req.params;

    const branch = await Branch.findById(id);

    if (!branch) {
      return res.status(404).json({
        success: false,
        message: "Branch not found",
      });
    }

    // Branch managers can only access their own branch dashboard
    if (req.user?.role === "BranchManager" && req.user.branch &&
        id !== req.user.branch.toString()) {
      return res.status(403).json({
        success: false,
        message: "Access denied: Can only access your own branch dashboard"
      });
    }

    // Admins can only access dashboards of branches they created
    if (req.user?.role === "Admin" && branch.admin.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Access denied: Can only access your own branch dashboards"
      });
    }

    const orders = await Order.find({ branch: id });

    const totalOrders = orders.length;

    const totalRevenue = orders.reduce(
      (acc: number, o: any) => acc + o.totalAmount,
      0
    );

    const pending = orders.filter((o) => o.status === "Pending").length;
    const processing = orders.filter((o) => o.status === "Processing").length;
    const shipped = orders.filter((o) => o.status === "Shipped").length;
    const delivered = orders.filter((o) => o.status === "Delivered").length;
    const cancelled = orders.filter((o) => o.status === "Cancelled").length;

    // 📊 Chart Data
    const chartMap: any = {};

    orders.forEach((o: any) => {
      const date = new Date(o.createdAt).toLocaleDateString();

      if (!chartMap[date]) {
        chartMap[date] = 0;
      }

      chartMap[date] += o.totalAmount;
    });

    const chartData = Object.keys(chartMap).map((date) => ({
      date,
      revenue: chartMap[date],
    }));

    res.json({
      success: true,
      data: {
        totalOrders,
        totalRevenue,
        pending,
        processing,
        shipped,
        delivered,
        cancelled,
        orders,
        chartData,
      },
    });
  } catch (err) {
    console.error("Get branch dashboard error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch dashboard" });
  }
};

// ✅ Get Deleted Branches (Trash)
export const getDeletedBranches = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    // Only admins can see deleted branches
    if (req.user?.role !== "Admin" && !getPermissions(req).includes("admin:full_access")) {
      return res.status(403).json({
        success: false,
        message: "Admin access required to view deleted branches"
      });
    }

    const branches = await Branch.find({ isDeleted: true }).sort({
      createdAt: -1,
    });

    res.json({
      success: true,
      data: branches,
    });
  } catch (err) {
    console.error("Get deleted branches error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch deleted branches" });
  }
};

// ✅ Restore Branch
export const restoreBranch = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    // Only admins can restore branches
    if (req.user?.role !== "Admin" && !getPermissions(req).includes("admin:full_access")) {
      return res.status(403).json({
        success: false,
        message: "Admin access required to restore branches"
      });
    }

    const branch = await Branch.findById(req.params.id);

    if (!branch) {
      return res.status(404).json({
        success: false,
        message: "Branch not found",
      });
    }

    // Admins can only restore branches they created
    if (req.user?.role === "Admin" && branch.admin.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Access denied: Can only restore your own branches"
      });
    }

    const restoredBranch = await Branch.findByIdAndUpdate(
      req.params.id,
      { isDeleted: false },
      { new: true }
    );

    res.json({
      success: true,
      message: "Branch restored",
      data: restoredBranch,
    });
  } catch (err) {
    console.error("Restore branch error:", err);
    res.status(500).json({ success: false, message: "Failed to restore branch" });
  }
};
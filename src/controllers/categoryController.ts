import { Request, Response } from "express"
import Category from "../models/category"
import Notification from "../models/notification"
import { AuthenticatedRequest } from "../middleware/authMiddleware"
// Helper to get permissions from role fallback
const getPermissions = (req: AuthenticatedRequest): string[] => {
  if (!req.user) return [];
  if (req.user.permissions && req.user.permissions.length > 0) {
    return req.user.permissions;
  }
  const rolePerms: Record<string, string[]> = {
    Admin: ["admin:full_access"],
    BranchManager: ["categories:read", "categories:create", "categories:update"],
    Employee: ["categories:read"],
    User: ["categories:read"]
  };
  return rolePerms[req.user.role] || [];
};

const normalizeBranchId = (branch: any): string | null => {
  if (!branch) return null;
  if (typeof branch === "string") return branch;
  if (branch._id) return branch._id.toString();
  if (typeof branch.toString === "function") return branch.toString();
  return null;
};

/* ✅ Request Body Interface */

interface CreateCategoryBody {
  name: string
  description: string
  status: "Active" | "Inactive"
  branch?: string
}

/* ✅ Create Category Controller */

export const createCategory = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<Response> => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { name, description, status, branch } = req.body as CreateCategoryBody

    /* ✅ Validation */

    if (!name || !description) {
      return res.status(400).json({
        success: false,
        message: "Name and Description required",
      })
    }

    // For employees and branch managers, use their assigned branch
    let categoryBranch = branch;
    if ((req.user?.role === "Employee" || req.user?.role === "BranchManager") && req.user.branch) {
      categoryBranch = req.user.branch;
    }

    if (!categoryBranch) {
      return res.status(400).json({
        success: false,
        message: "Branch is required",
      })
    }

    /* ✅ Check Already Exist within branch */

    const exist = await Category.findOne({ name, branch: categoryBranch })

    if (exist) {
      return res.status(400).json({
        success: false,
        message: "Category already exists in this branch",
      })
    }

    /* ✅ Create */

    const businessAdminId = (req.user as any).admin || req.user._id;

    const category = await Category.create({
      name,
      description,
      status,
      branch: categoryBranch,
      admin: businessAdminId,
    })

    const populatedCategory = await Category.findById(category._id).populate('branch', 'name');

    await Notification.create({
      title: "Category Created",
      message: `Category ${category.name} created by ${req.user?.name || "system"}.`,
      type: "category:create",
      recipientRoles: ["Admin", "BranchManager", "Employee"],
      branch: categoryBranch,
      admin: req.user._id,
      data: { categoryId: category._id },
      readBy: [],
    });

    /* ✅ Response */

    return res.status(201).json({
      success: true,
      message: "Category created successfully",
      data: populatedCategory,
    })
  } catch (error) {
    console.error("Create category error:", error)

    return res.status(500).json({
      success: false,
      message: "Server Error",
    })
  }
}

// GET ALL CATEGORIES
export const getAllCategories = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    let query: any = {};

    // Employees and branch managers can only see categories from their branch
    if ((req.user?.role === "Employee" || req.user?.role === "BranchManager") && req.user.branch) {
      query.branch = req.user.branch;
    }

    // Admin can see categories in own business scope (admin and manager children)
    if (req.user?.role === "Admin") {
      query.admin = { $in: [req.user._id, req.user.admin || req.user._id] };
    }

    const categories = await Category.find(query)
      .populate('branch', 'name')
      .sort({ createdAt: -1 }); // latest first

    res.status(200).json({
      success: true,
      data: categories,
    });
  } catch (error) {
    console.error("Get Categories Error:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// Get Single Category
export const getCategoryById = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const category = await Category.findById(req.params.id).populate('branch', 'name');

    if (!category) return res.status(404).json({ success: false, message: "Category not found" });

    // Employees and branch managers can only access categories from their branch
    if (req.user?.role === "Employee" || req.user?.role === "BranchManager") {
      if (!req.user.branch) {
        return res.status(403).json({
          success: false,
          message: "Access denied: No branch assigned to your account. Please contact administrator to assign you to a branch.",
          code: "BRANCH_NOT_ASSIGNED",
          userRole: req.user.role,
          userEmail: req.user.email
        });
      }

      const normalizeBranchId = (branch: any): string | null => {
        if (!branch) return null;
        if (typeof branch === "string") return branch;
        if (branch._id) return branch._id.toString();
        if (typeof branch.toString === "function") return branch.toString();
        return null;
      };

      const categoryBranchId = normalizeBranchId(category.branch);
      const userBranchId = normalizeBranchId(req.user.branch);

      if (!categoryBranchId) {
        return res.status(403).json({
          success: false,
          message: "Access denied: Category has no branch"
        });
      }

      if (!userBranchId) {
        return res.status(403).json({
          success: false,
          message: "Access denied: No branch assigned to your user account"
        });
      }

      if (categoryBranchId !== userBranchId) {
        return res.status(403).json({
          success: false,
          message: "Access denied: Can only access categories from your branch"
        });
      }
    }

    // Admin can access only their own categories
    if (req.user?.role === "Admin" && category.admin.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "Access denied: Can only access your own categories" });
    }

    return res.json({ success: true, data: category });
  } catch (error) {
    console.error("Get category by ID error:", error);
    return res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Update Category
export const updateCategory = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    // Check if category exists and belongs to user's branch
    const existingCategory = await Category.findById(req.params.id);
    if (!existingCategory) return res.status(404).json({ success: false, message: "Category not found" });

    // Employees and branch managers can only update categories from their branch
    if (req.user?.role === "Employee" || req.user?.role === "BranchManager") {
      if (!req.user.branch) {
        return res.status(403).json({
          success: false,
          message: "Access denied: No branch assigned to your account. Please contact administrator to assign you to a branch.",
          code: "BRANCH_NOT_ASSIGNED",
          userRole: req.user.role,
          userEmail: req.user.email
        });
      }

      const existingBranchId = normalizeBranchId(existingCategory.branch);
      const userBranchId = normalizeBranchId(req.user.branch);

      if (!existingBranchId || !userBranchId || existingBranchId !== userBranchId) {
        return res.status(403).json({
          success: false,
          message: "Access denied: Can only update categories from your branch"
        });
      }
    }

    // Admin can update only their own categories
    if (req.user?.role === "Admin" && existingCategory.admin.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "Access denied: Can only update your own categories" });
    }

    const { name, description, status, branch } = req.body as CreateCategoryBody;

    let updateData: any = {
      name,
      description,
      status,
    };

    // Only admins can change branch assignment
    if (branch && (req.user?.role === "Admin" || getPermissions(req).includes("admin:full_access"))) {
      updateData.branch = branch;
    }

    const category = await Category.findByIdAndUpdate(req.params.id, updateData, { new: true }).populate('branch', 'name');

    await Notification.create({
      title: "Category Updated",
      message: `Category ${category?.name} updated by ${req.user?.name || "system"}.`,
      type: "category:update",
      recipientRoles: ["Admin", "BranchManager", "Employee"],
      branch: category?.branch,
      admin: req.user._id,
      data: { categoryId: category?._id },
      readBy: [],
    });

    return res.json({ success: true, data: category });
  } catch (error) {
    console.error("Update category error:", error);
    return res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Delete Category
export const deleteCategory = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    // Check if category exists and belongs to user's branch
    const category = await Category.findById(req.params.id);
    if (!category) return res.status(404).json({ success: false, message: "Category not found" });

    // Employees and branch managers can only delete categories from their branch
    if (req.user?.role === "Employee" || req.user?.role === "BranchManager") {
      if (!req.user.branch) {
        return res.status(403).json({
          success: false,
          message: "Access denied: No branch assigned to your account. Please contact administrator to assign you to a branch.",
          code: "BRANCH_NOT_ASSIGNED",
          userRole: req.user.role,
          userEmail: req.user.email
        });
      }

      const categoryBranchId = normalizeBranchId(category.branch);
      const userBranchId = normalizeBranchId(req.user.branch);

      if (!categoryBranchId || !userBranchId || categoryBranchId !== userBranchId) {
        return res.status(403).json({
          success: false,
          message: "Access denied: Can only delete categories from your branch"
        });
      }
    }

    // Admin can delete only their own categories
    if (req.user?.role === "Admin" && category.admin.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "Access denied: Can only delete your own categories" });
    }

    await Category.findByIdAndDelete(req.params.id);
    return res.json({ success: true, message: "Category deleted" });
  } catch (error) {
    console.error("Delete category error:", error);
    return res.status(500).json({ success: false, message: "Server Error" });
  }
};
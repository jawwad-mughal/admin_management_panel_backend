import { Request, Response } from "express";
import Product from "../models/product";
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
    BranchManager: ["products:read", "products:create", "products:update"],
    Employee: ["products:read"],
    User: ["products:read"]
  };
  return rolePerms[req.user.role] || [];
};

/* ================= CREATE ================= */
export const createProduct = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { name, category, price, stock, status, branch } = req.body;

    if (!name || !category || !price || !stock) {
      return res
        .status(400)
        .json({ success: false, message: "All fields required" });
    }

    // For employees and branch managers, use their assigned branch; admin can omit branch
    let productBranch = branch;
    if ((req.user?.role === "Employee" || req.user?.role === "BranchManager") && req.user?.branch) {
      productBranch = req.user.branch;
    }

    // Branch is required for role-bound users
    if (!productBranch && req.user?.role !== "Admin") {
      return res
        .status(400)
        .json({ success: false, message: "Branch is required" });
    }

    let imageUrl: string | undefined;

    if (req.file && "path" in req.file) {
      imageUrl = req.file.path;
    }

    const businessAdminId = (req.user as any).admin || req.user._id;

    const product = await Product.create({
      name,
      category,
      price,
      stock,
      status,
      image: imageUrl,
      branch: productBranch,
      admin: businessAdminId,
    });

    const populatedProduct = await Product.findById(product._id).populate('category', 'name').populate('branch', 'name');

    await Notification.create({
      title: "Product Created",
      message: `Product ${product.name} created by ${req.user?.name || "system"}.`,
      type: "product:create",
      recipientRoles: ["Admin", "BranchManager", "Employee"],
      branch: productBranch,
      admin: req.user._id,
      data: { productId: product._id },
      readBy: [],
    });

    res.status(201).json({
      success: true,
      message: "Product created",
      data: populatedProduct,
    });
  } catch (error) {
    console.error("Create product error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

/* ================= GET ALL ================= */
export const getAllProducts = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    let query: any = {};

    // Employees and branch managers can only see products from their branch
    if ((req.user?.role === "Employee" || req.user?.role === "BranchManager") && req.user?.branch) {
      query.branch = req.user.branch;
    }

    // Admin can see products in own business scope (admin and manager child items)
    if (req.user?.role === "Admin") {
      query.admin = { $in: [req.user._id, req.user.admin || req.user._id] };
    }

    const products = await Product.find(query)
      .populate('category', 'name')
      .populate('branch', 'name')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: products,
    });
  } catch (error) {
    console.error("Get all products error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch products" });
  }
};

/* ================= GET SINGLE ================= */
export const getSingleProduct = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    // Validate ObjectId
    if (!req.params.id || typeof req.params.id !== 'string' || !req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ success: false, message: "Invalid product ID" });
    }

    const product = await Product.findById(req.params.id);
    console.log(product)

    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    // Employees and branch managers can only access products from their branch
    if (req.user?.role === "Employee" || req.user?.role === "BranchManager") {
      if (!req.user || !req.user.branch) {
        return res.status(403).json({
          success: false,
          message: "Access denied: No branch assigned to your account. Please contact administrator to assign you to a branch.",
          code: "BRANCH_NOT_ASSIGNED",
          userRole: req.user?.role,
          userEmail: req.user?.email
        });
      }

      const normalizeBranchId = (branch: any): string | null => {
        if (!branch) return null;
        if (typeof branch === "string") return branch;
        if (branch._id) return branch._id.toString();
        if (typeof branch.toString === "function") return branch.toString();
        return null;
      };

      const productBranchId = normalizeBranchId(product.branch);
      const userBranchId = normalizeBranchId(req.user.branch);

      if (!productBranchId) {
        return res.status(403).json({
          success: false,
          message: "Access denied: Product has no branch"
        });
      }

      if (!userBranchId) {
        return res.status(403).json({
          success: false,
          message: "Access denied: No branch assigned to your user account"
        });
      }

      if (productBranchId !== userBranchId) {
        return res.status(403).json({
          success: false,
          message: "Access denied: Can only access products from your branch"
        });
      }
    }

    // Admin can access only their own products
    if (req.user?.role === "Admin" && product.admin.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Access denied: Can only access your own products"
      });
    }

    // Safe populate - catch any populate errors
    try {
      await product.populate('category', 'name');
      await product.populate('branch', 'name');
    } catch (populateError) {
      console.error("Populate error:", populateError);
      // Continue without populated data
    }

    res.json({
      success: true,
      data: product,
    });
  } catch (error: any) {
    console.error("Get single product error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch product", error: error.message || "Internal server error" });
  }
};

/* ================= UPDATE ================= */
export const updateProduct = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    // Validate ObjectId
    if (!req.params.id || typeof req.params.id !== 'string' || !req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ success: false, message: "Invalid product ID" });
    }

    const { name, category, price, stock, status, branch } = req.body;

    // Check if product exists and belongs to user's branch
    const existingProduct = await Product.findById(req.params.id);
    if (!existingProduct) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    // Employees and branch managers can only update products from their branch
    if (req.user?.role === "Employee" || req.user?.role === "BranchManager") {
      if (!req.user || !req.user.branch) {
        return res.status(403).json({
          success: false,
          message: "Access denied: No branch assigned to your account. Please contact administrator to assign you to a branch.",
          code: "BRANCH_NOT_ASSIGNED",
          userRole: req.user?.role,
          userEmail: req.user?.email
        });
      }

      const userBranch = req.user.branch;
      const productBranch = existingProduct.branch;

      if (!productBranch || productBranch.toString() !== userBranch.toString()) {
        return res.status(403).json({
          success: false,
          message: "Access denied: Can only update products from your branch"
        });
      }
    }

    // Admin can update only their own products
    if (req.user?.role === "Admin" && existingProduct.admin.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "Access denied: Can only update your own products" });
    }

    let updateData: any = {      name,
      category,
      price,
      stock,
      status,
    };

    // Only admins can change branch assignment
    if (branch && (req.user?.role === "Admin" || getPermissions(req).includes("admin:full_access"))) {
      updateData.branch = branch;
    }

    // ✅ If new image uploaded
    if (req.file && "path" in req.file) {
      updateData.image = req.file.path;
    }

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    ).populate('category', 'name').populate('branch', 'name');

    await Notification.create({
      title: "Product Updated",
      message: `Product ${product?.name} updated by ${req.user?.name || "system"}.`,
      type: "product:update",
      recipientRoles: ["Admin", "BranchManager", "Employee"],
      branch: product?.branch,
      admin: req.user._id,
      data: { productId: product?._id },
      readBy: [],
    });

    res.json({
      success: true,
      message: "Product Updated",
      data: product,
    });
  } catch (error: any) {
    console.error("Update product error:", error);
    res.status(500).json({ success: false, message: "Failed to update product", error: error.message || "Internal server error" });
  }
};

/* ================= DELETE ================= */
export const deleteProduct = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    // Validate ObjectId
    if (!req.params.id || typeof req.params.id !== 'string' || !req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ success: false, message: "Invalid product ID" });
    }

    // Check if product exists and belongs to user's branch
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    // Employees and branch managers can only delete products from their branch
    if (req.user?.role === "Employee" || req.user?.role === "BranchManager") {
      if (!req.user || !req.user.branch) {
        return res.status(403).json({
          success: false,
          message: "Access denied: No branch assigned to your account. Please contact administrator to assign you to a branch.",
          code: "BRANCH_NOT_ASSIGNED",
          userRole: req.user?.role,
          userEmail: req.user?.email
        });
      }

      const userBranch = req.user.branch;
      const productBranch = product.branch;

      if (!productBranch || productBranch.toString() !== userBranch.toString()) {
        return res.status(403).json({
          success: false,
          message: "Access denied: Can only delete products from your branch"
        });
      }
    }

    // Admin can delete only their own products
    if (req.user?.role === "Admin" && product.admin.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "Access denied: Can only delete your own products" });
    }

    await Product.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: "Product Deleted",
    });
  } catch (error) {
    console.error("Delete product error:", error);
    res.status(500).json({ success: false, message: "Failed to delete product" });
  }
};
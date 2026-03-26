import { Request, Response } from "express";
import Order from "../models/order";
import Notification from "../models/notification";
import { AuthenticatedRequest } from "../middleware/authMiddleware";

// Helper to normalize branch ID for comparison
const normalizeBranchId = (branch: any): string => {
  if (!branch) return "";
  if (typeof branch === "string") return branch;
  if (branch._id) return branch._id.toString();
  if (branch.toString && branch.toString() !== "[object Object]") return branch.toString();
  return "";
};

// ✅ Create Order
export const createOrder = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { customerName, phone, address, paymentMethod, products, totalAmount, status, branch } = req.body;

    if (!customerName || !phone || !address || !products || !totalAmount) {
      return res.status(400).json({ success: false, message: "All fields required" });
    }

    // For employees and branch managers, use their assigned branch
    let orderBranch = branch;
    if ((req.user?.role === "Employee" || req.user?.role === "BranchManager") && req.user.branch) {
      orderBranch = req.user.branch;
    }

    if (!orderBranch) {
      return res.status(400).json({ success: false, message: "Branch is required" });
    }

    const businessAdminId = (req.user as any).admin || req.user._id;

    const order = await Order.create({
      user: req.user?.id,
      customerName,
      phone,
      address,
      paymentMethod,
      products,
      totalAmount,
      status: status || "Pending",
      branch: orderBranch,
      admin: businessAdminId,
    });

    const populatedOrder = await Order.findById(order._id)
      .populate('user', 'name')
      .populate('branch', 'name')
      .populate('products.productId', 'name category');

    await Notification.create({
      title: "New Order Placed",
      message: `${customerName} placed an order for $${totalAmount.toFixed(2)}.`,
      type: "order:new",
      recipientRoles: ["Admin", "BranchManager", "Employee"],
      branch: orderBranch,
      admin: req.user._id,
      data: { orderId: order._id },
      readBy: [],
    });

    return res.status(201).json({
      success: true,
      message: "Order created successfully",
      data: populatedOrder,
    });
  } catch (err) {
    console.error("Create order error:", err);
    return res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ✅ Get All Orders
export const getAllOrders = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    let query: any = {};

    // Employees and branch managers can only see orders from their branch
    if ((req.user?.role === "Employee" || req.user?.role === "BranchManager") && req.user.branch) {
      query.branch = req.user.branch;
    }

    // Admin can see orders in own business scope (admin and manager children)
    if (req.user?.role === "Admin") {
      query.admin = { $in: [req.user._id, req.user.admin || req.user._id] };
    } else if (req.user?.role === "User") {
      query.user = req.user._id;
    }

    const orders = await Order.find(query)
      .populate('user', 'name')
      .populate('branch', 'name')
      .populate('products.productId', 'name category')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: orders });
  } catch (err) {
    console.error("Get all orders error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ✅ Get Single Order
export const getOrderById = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const order = await Order.findById(req.params.id)
      .populate('user', 'name')
      .populate('branch', 'name')
      .populate('products.productId', 'name category');

    if (!order)
      return res.status(404).json({ success: false, message: "Order not found" });

    // Employees and branch managers can only access orders from their branch
    if ((req.user?.role === "Employee" || req.user?.role === "BranchManager") &&
        req.user.branch && normalizeBranchId(order.branch) !== req.user.branch.toString()) {
      return res.status(403).json({
        success: false,
        message: "Access denied: Can only access orders from your branch"
      });
    }

    // Admin can access only their own orders
    if (req.user?.role === "Admin" && order.admin.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Access denied: Can only access your own orders"
      });
    }

    // Regular users can only access their own orders
    if (req.user?.role === "User" && order.user?.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Access denied: Can only access your own orders"
      });
    }

    res.status(200).json({ success: true, data: order });
  } catch (err) {
    console.error("Get order by ID error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ✅ Update Order Status
export const updateOrderStatus = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { status } = req.body;
    if (!status)
      return res.status(400).json({ success: false, message: "Status is required" });

    // Check if order exists and belongs to user's branch
    const existingOrder = await Order.findById(req.params.id);
    if (!existingOrder)
      return res.status(404).json({ success: false, message: "Order not found" });

    // Employees and branch managers can only update orders from their branch
    if ((req.user?.role === "Employee" || req.user?.role === "BranchManager") &&
        req.user.branch && normalizeBranchId(existingOrder.branch) !== req.user.branch.toString()) {
      return res.status(403).json({
        success: false,
        message: "Access denied: Can only update orders from your branch"
      });
    }

    // Admin can update only their own orders
    if (req.user?.role === "Admin" && existingOrder.admin.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Access denied: Can only update your own orders"
      });
    }

    // Regular users can only update their own orders (if needed)
    if (req.user?.role === "User" && existingOrder.user?.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Access denied: Can only update your own orders"
      });
    }

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    ).populate('user', 'name').populate('branch', 'name').populate('products.productId', 'name category');

    await Notification.create({
      title: "Order Status Updated",
      message: `Order #${order?._id?.toString().slice(-6)} status changed to ${status}.`,
      type: "order:update",
      recipientRoles: ["Admin", "BranchManager", "Employee"],
      branch: order?.branch || undefined,
      admin: req.user._id,
      data: { orderId: order?._id, status },
      readBy: [],
    });

    res.status(200).json({ success: true, data: order });
  } catch (err) {
    console.error("Update order status error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// ✅ Delete Order
export const deleteOrder = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    // Check if order exists and belongs to user's branch
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Employees and branch managers can only delete orders from their branch
    if ((req.user?.role === "Employee" || req.user?.role === "BranchManager") &&
        req.user.branch && normalizeBranchId(order.branch) !== req.user.branch.toString()) {
      return res.status(403).json({
        success: false,
        message: "Access denied: Can only delete orders from your branch"
      });
    }

    // Admin can delete only their own orders
    if (req.user?.role === "Admin" && order.admin.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Access denied: Can only delete your own orders"
      });
    }

    // Regular users can only delete their own orders
    if (req.user?.role === "User" && order.user?.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Access denied: Can only delete your own orders"
      });
    }

    await Order.findByIdAndDelete(req.params.id);

    return res.status(200).json({
      success: true,
      message: "Order deleted successfully",
    });
  } catch (err) {
    console.error("Delete order error:", err);
    return res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
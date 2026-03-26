import { Request, Response } from "express";
import Order from "../models/order";
import { AuthenticatedRequest } from "../middleware/authMiddleware";

export const getReports = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const {
      startDate,
      endDate,
      branch,
      status,
      search,
      page = 1,
      limit = 10,
    } = req.query;

    let filter: any = {};

    // 📅 Date filter
    if (startDate && endDate) {
      filter.createdAt = {
        $gte: new Date(startDate as string),
        $lte: new Date(endDate as string),
      };
    }

    // 🏢 Branch filter - restrict to user's branch for employees and branch managers
    if ((req.user?.role === "Employee" || req.user?.role === "BranchManager") && req.user.branch) {
      // Force filter to user's branch
      filter.branch = req.user.branch;
    } else if (branch) {
      // Admins can filter by any branch
      filter.branch = branch;
    }

    // 📦 Status filter
    if (status) {
      filter.status = status;
    }

    // 🔍 Search (Customer Name)
    if (search) {
      filter.customerName = {
        $regex: search,
        $options: "i", // case-insensitive
      };
    }

    // Admin can see orders in own business scope (admin and manager children)
    if (req.user?.role === "Admin") {
      filter.admin = { $in: [req.user._id, req.user.admin || req.user._id] };
    } else if (req.user?.role === "User") {
      filter.user = req.user._id;
    }

    // 📄 Pagination
    const skip = (Number(page) - 1) * Number(limit);

    const orders = await Order.find(filter)
      .populate('branch', 'name')
      .populate('user', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    const totalCount = await Order.countDocuments(filter);

    // 🔢 Stats (IMPORTANT: full dataset ke liye alag query)
    const allOrders = await Order.find(filter);

    const totalOrders = allOrders.length;

    const totalRevenue = allOrders.reduce(
      (acc: number, o: any) => acc + o.totalAmount,
      0
    );

    const pending = allOrders.filter((o) => o.status === "Pending").length;
    const processing = allOrders.filter((o) => o.status === "Processing").length;
    const shipped = allOrders.filter((o) => o.status === "Shipped").length;
    const delivered = allOrders.filter((o) => o.status === "Delivered").length;
    const cancelled = allOrders.filter((o) => o.status === "Cancelled").length;

    // 📊 Chart Data
    const chartMap: any = {};

    allOrders.forEach((o: any) => {
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
        pagination: {
          total: totalCount,
          page: Number(page),
          pages: Math.ceil(totalCount / Number(limit)),
        },
      },
    });

  } catch (err) {
    console.error("Get reports error:", err);
    res.status(500).json({ success: false, message: "Failed to generate reports" });
  }
};
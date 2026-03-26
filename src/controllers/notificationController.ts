import { Request, Response } from "express";
import Notification from "../models/notification";
import { AuthenticatedRequest } from "../middleware/authMiddleware";

// Get all notifications for current user based on role/branch
export const getNotifications = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const role = req.user.role;
    const branchId = req.user.branch;
    const userId = req.user.id;

    const query: any = {
      $or: [
        { recipientRoles: role },
        { recipientRoles: "Admin" },
      ],
    };

    // For admins, only show notifications they created
    if (role === "Admin") {
      query.admin = userId;
    }

    if (branchId) {
      query.$or.push({ branch: branchId });
    }

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const unreadCount = notifications.filter((n) => {
      if (!req.user) return false;
      return !n.readBy?.some((userId: any) => userId?.toString() === req.user?.id?.toString());
    }).length;

    res.status(200).json({ success: true, data: { notifications, unreadCount } });
  } catch (err) {
    console.error("Get notifications error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Mark all notifications as read for current user
export const markAllNotificationsRead = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const role = req.user.role;
    const userId = req.user.id;

    // Build query to only update relevant notifications
    const query: any = {};

    // For admins, only mark their own notifications as read
    if (role === "Admin") {
      query.admin = userId;
    }

    await Notification.updateMany(
      query,
      {
        $addToSet: {
          readBy: userId,
        },
      }
    );

    res.status(200).json({ success: true, message: "Notifications marked read" });
  } catch (err) {
    console.error("Mark notifications read error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

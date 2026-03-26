import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET!;

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    _id: string;
    name?: string;
    email: string;
    role: string;
    permissions: string[];
    branch?: string;
    admin?: string;
  };
}

export const authMiddleware = ( req: Request, res: Response, next: NextFunction ) => {
  // Check for token in cookies (accessToken) or Authorization header
  const tokenFromCookie = req.cookies?.accessToken;
  const authHeader = req.headers.authorization;
  const tokenFromHeader = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  
  const token = tokenFromCookie || tokenFromHeader;

  // ❌ Token missing
  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Not authorized. No token provided",
    });
  }

  try {
    // ✅ Token verify
    const decoded = jwt.verify(token, JWT_SECRET);

    (req as any).user = decoded;

    // ✅ Token valid → next()
    return next();

  } catch (error: any) {

    // ❌ Token expired
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Token expired",
      });
    }

    // ❌ Token invalid
    return res.status(401).json({
      success: false,
      message: "Invalid token",
    });
  }
};


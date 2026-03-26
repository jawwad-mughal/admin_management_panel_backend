import { Request, Response, NextFunction } from "express";

// Custom Error Class
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public code?: string
  ) {
    super(message);
    Error.captureStackTrace(this, this.constructor);
  }
}

// Error Handler Middleware
export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let error = err;

  // Mongoose validation error
  if (err.name === "ValidationError") {
    const statusCode = 400;
    const message = Object.values(err.errors)
      .map((e: any) => e.message)
      .join(", ");
    error = new AppError(statusCode, message, "VALIDATION_ERROR");
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern)[0];
    const statusCode = 400;
    const message = `${field} already exists`;
    error = new AppError(statusCode, message, "DUPLICATE_KEY");
  }

  // JWT errors
  if (err.name === "JsonWebTokenError") {
    const statusCode = 401;
    const message = "Invalid token";
    error = new AppError(statusCode, message, "INVALID_TOKEN");
  }

  if (err.name === "TokenExpiredError") {
    const statusCode = 401;
    const message = "Token expired";
    error = new AppError(statusCode, message, "TOKEN_EXPIRED");
  }

  // Default error response
  const statusCode = error?.statusCode || 500;
  const message = error?.message || "Internal Server Error";
  const code = error?.code || "INTERNAL_ERROR";

  console.error(`[${code}]`, message, err);

  res.status(statusCode).json({
    success: false,
    message,
    code,
    ...(process.env.NODE_ENV === "development" && { error: err.stack }),
  });
};

// Async handler wrapper - wrap async route handlers to catch errors
export const asyncHandler = (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

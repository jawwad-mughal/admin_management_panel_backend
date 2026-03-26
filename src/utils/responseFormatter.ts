import { Response } from "express";

export interface ApiSuccessResponse<T = any> {
  success: true;
  message: string;
  data?: T;
  statusCode: number;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
  code?: string;
  statusCode: number;
}

export class ResponseFormatter {
  /**
   * Send success response
   */
  static success<T = any>(
    res: Response,
    message: string,
    data?: T,
    statusCode: number = 200
  ): Response {
    return res.status(statusCode).json({
      success: true,
      message,
      ...(data && { data }),
      statusCode,
    });
  }

  /**
   * Send error response
   */
  static error(
    res: Response,
    message: string,
    statusCode: number = 400,
    code?: string
  ): Response {
    return res.status(statusCode).json({
      success: false,
      message,
      code,
      statusCode,
    });
  }

  /**
   * Send paginated response
   */
  static paginated<T = any>(
    res: Response,
    message: string,
    data: T[],
    total: number,
    page: number,
    limit: number,
    statusCode: number = 200
  ): Response {
    return res.status(statusCode).json({
      success: true,
      message,
      data,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
      statusCode,
    });
  }
}

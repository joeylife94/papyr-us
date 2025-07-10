export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: {
    code?: string;
    message: string;
    details?: any;
  };
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export function createSuccessResponse<T>(data: T, message?: string): ApiResponse<T> {
  return {
    success: true,
    data,
    ...(message && { message })
  };
}

export function createErrorResponse(message: string, code?: string, details?: any): ApiResponse {
  return {
    success: false,
    error: {
      message,
      ...(code && { code }),
      ...(details && { details })
    }
  };
} 
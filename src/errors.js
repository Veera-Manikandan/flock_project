
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);

    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;

    Error.captureStackTrace?.(this, AppError);
  }
}

export function notFoundHandler(req, res) {
  return res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: `No API route matches ${req.method} ${req.path}`,
    },
  });
}

export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  const status =
    Number.isInteger(err.status) && err.status >= 400 && err.status <= 599
      ? err.status
      : 500;

  const code =
    err.code ||
    (status === 500 ? "INTERNAL_ERROR" : "REQUEST_ERROR");

  if (status >= 500) {
    console.error("API error:", {
      code,
      message: err.message,
      path: req.originalUrl || req.path,
    });
  }

  const message =
    status === 500 && process.env.NODE_ENV === "production"
      ? "An unexpected error occurred"
      : err.message || "An unexpected error occurred";

  return res.status(status).json({
    error: {
      code,
      message,
      ...(err.details ? { details: err.details } : {}),
    },
  });
}

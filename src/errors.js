export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function notFoundHandler(req, res) {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: `No API route matches ${req.method} ${req.path}`
    }
  });
}

export function errorHandler(err, req, res, next) {
  const status = Number.isInteger(err.status) ? err.status : 500;
  const code = err.code || (status === 500 ? "INTERNAL_ERROR" : "REQUEST_ERROR");
  if (status >= 500) console.error(err);
  res.status(status).json({
    error: {
      code,
      message: status === 500 && process.env.NODE_ENV === "production"
        ? "An unexpected error occurred"
        : (err.message || "An unexpected error occurred"),
      ...(err.details ? { details: err.details } : {})
    }
  });
}

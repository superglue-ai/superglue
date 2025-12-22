export function traceIdMiddleware(req: any, res: any, next: any) {
  // Check both top-level traceId variable and nested options.traceId
  const traceId = req.body?.variables?.traceId || req.body?.variables?.options?.traceId || generateTraceId();
  req.traceId = traceId;
  next();
}

export function generateTraceId(): string {
  return crypto.randomUUID();
}
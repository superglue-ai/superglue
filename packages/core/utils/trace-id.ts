export function traceIdMiddleware(req: any, res: any, next: any) {
  const traceId = req.body?.variables?.options?.traceId || generateTraceId();
  req.traceId = traceId;
  next();
}

export function generateTraceId(): string {
  return crypto.randomUUID();
}
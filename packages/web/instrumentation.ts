import type { ShouldExportSpan } from "@langfuse/otel";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

const shouldExportSpan: ShouldExportSpan = (span) => {
  return span.otelSpan.instrumentationScope.name !== "next.js";
};

export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  if (!process.env.LANGFUSE_SECRET_KEY || !process.env.LANGFUSE_PUBLIC_KEY) {
    return;
  }

  const { LangfuseSpanProcessor } = require("@langfuse/otel");
  const langfuseSpanProcessor = new LangfuseSpanProcessor({
    shouldExportSpan,
  });

  const tracerProvider = new NodeTracerProvider({
    spanProcessors: [langfuseSpanProcessor],
  });

  tracerProvider.register();
}

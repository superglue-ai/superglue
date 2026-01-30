"use client";

import React, { useState, useRef, useEffect } from "react";
import { SuperglueClient, ToolResult } from "@superglue/shared";
import { useConfig, useSupabaseClient } from "@/src/app/config-context";
import {
  Download,
  Loader2,
  Play,
  Package,
  Database,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import { cn } from "@/src/lib/general-utils";
import EmbeddedLoginView from "./EmbeddedLoginView";
import EmbeddedConfigModal from "./EmbeddedConfigModal";
import { tokenRegistry } from "@/src/lib/token-registry";
import { ToolTemplate } from "@/src/lib/tool-templates/tool-templates";

const MARKETING_STYLES = `
  /* Match marketing site styling - LIGHT MODE */
  * {
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }

  body, html {
    background: #ffffff;
    margin: 0;
    padding: 0;
    min-height: 100vh;
    font-family: 'YuGothic', 'Yu Gothic', sans-serif;
  }

  .embedded-container {
    background: #ffffff;
    color: #1a1a1a;
    font-family: 'YuGothic', 'Yu Gothic', sans-serif;
    min-height: 100vh;
    width: 100%;
    padding: 2rem;
  }

  .input-with-chips {
    background: #ffffff;
    border: 1px solid #ddd;
    border-radius: 0;
    cursor: text;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    max-width: 100%;
    min-height: 42px;
    overflow: hidden;
    padding: 10px 12px;
    transition: all 0.2s ease;
    width: 100%;
    color: #333;
    font-family: 'YuGothic', 'Yu Gothic', sans-serif;
    font-size: 14px;
  }

  .input-with-chips:focus-within {
    border-color: #000;
    outline: none;
  }

  /* Primary CTA button - matching marketing site exactly */
  .workflow-cta-button {
    align-items: center;
    background: #000;
    border: 1px solid #000;
    border-radius: 99px;
    color: #fff;
    cursor: pointer;
    display: inline-flex;
    font-family: 'YuGothic', 'Yu Gothic', sans-serif;
    font-size: 14px;
    font-weight: 600;
    gap: 0.5rem;
    padding: 12px 24px;
    text-align: center;
    text-decoration: none;
    text-transform: uppercase;
    transition: all 0.2s ease;
    white-space: nowrap;
    line-height: 1.5;
  }

  .workflow-cta-button:hover {
    background: #1a1a1a !important;
    border-color: #1a1a1a !important;
    transform: translateY(-1px);
  }

  .workflow-cta-button:active {
    transform: translateY(0);
  }

  .workflow-cta-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background: #e5e7eb;
    color: #9ca3af;
    border-color: #e5e7eb;
    transform: none;
  }

  /* Secondary button - matching marketing site */
  .workflow-secondary-button {
    background: #ffffff;
    border: 1px solid #ddd;
    color: #000;
    padding: 12px 24px;
    border-radius: 99px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 600;
    transition: all 0.2s ease;
    font-family: 'YuGothic', 'Yu Gothic', sans-serif;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    line-height: 1.5;
    text-transform: uppercase;
  }

  .workflow-secondary-button:hover {
    background: #f5f5f5 !important;
    border-color: #999 !important;
  }

  /* Tool card */
  .tool-card {
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 0;
    padding: 1.5rem;
    transition: all 0.3s ease;
  }

  .tool-card:hover {
    border-color: #000;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  /* Step styling */
  .step-number {
    background: #000;
    color: #fff;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 14px;
    flex-shrink: 0;
  }

  /* State boxes */
  .error-box {
    background: #f8f8f8;
    border: 1px solid rgba(239, 68, 68, 0.2);
    border-radius: 0;
    padding: 1.5rem;
    color: #dc2626;
    transition: all 0.3s ease;
  }

  .error-box:hover {
    border-color: rgba(239, 68, 68, 0.4);
  }

  .success-box {
    background: #f8f8f8;
    border: 1px solid #e5e7eb;
    border-radius: 0;
    padding: 1.5rem;
    color: #000;
    transition: all 0.3s ease;
  }

  .waiting-box {
    background: #f8f8f8;
    border: 1px solid rgba(59, 130, 246, 0.2);
    border-radius: 0;
    padding: 1.5rem;
    color: #6b7280;
  }

  .loading-box {
    background: #f8f8f8;
    border: 1px solid rgba(59, 130, 246, 0.25);
    border-radius: 0;
    padding: 1.5rem;
    color: #3b82f6;
    transition: all 0.3s ease;
  }

  .loading-box:hover {
    border-color: rgba(59, 130, 246, 0.4);
  }

  /* Scrollbar styling */
  ::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  ::-webkit-scrollbar-track {
    background: #f9fafb;
  }

  ::-webkit-scrollbar-thumb {
    background: #d1d5db;
    border-radius: 4px;
  }

  ::-webkit-scrollbar-thumb:hover {
    background: #9ca3af;
  }

  /* Input and form styling */
  input[type="text"],
  input[type="number"],
  textarea {
    background: #ffffff;
    border: 1px solid #e5e7eb;
    color: #000;
    border-radius: 0;
    padding: 12px 16px;
    font-family: 'YuGothic', 'Yu Gothic', sans-serif;
    font-size: 14px;
    transition: all 0.2s ease;
  }

  input[type="text"]:focus,
  input[type="number"]:focus,
  textarea:focus {
    outline: none;
    border-color: #000;
  }

  /* Label styling */
  label {
    color: #000;
    font-size: 14px;
    font-weight: 600;
    font-family: 'YuGothic', 'Yu Gothic', sans-serif;
  }

  /* Timeline cards */
  .timeline-card {
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 0;
    transition: all 0.3s ease;
  }

  .timeline-card:hover {
    border-color: #000;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }
  
  /* Text colors for light mode */
  .text-muted-foreground {
    color: #6b7280;
  }
`;

interface EmbeddedToolTemplateExecutorProps {
  toolTemplate: ToolTemplate;
}

export default function EmbeddedToolTemplateExecutor({
  toolTemplate,
}: EmbeddedToolTemplateExecutorProps) {
  const [authState, setAuthState] = useState<"checking" | "logged-out" | "logged-in">("checking");
  const supabase = useSupabaseClient();
  const config = useConfig();
  const [modalOpen, setModalOpen] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ToolResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSubmittedData, setLastSubmittedData] = useState<{
    credentials: Record<string, string>;
    payload: Record<string, any>;
  } | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Check initial auth state
    checkAuth();

    // Listen for auth state changes
    if (supabase) {
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((event, session) => {
        if (session) {
          setAuthState("logged-in");
        } else {
          setAuthState("logged-out");
        }
      });

      return () => subscription.unsubscribe();
    }
  }, [supabase]);

  const checkAuth = async () => {
    if (!supabase) {
      setAuthState("logged-out");
      return;
    }

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        setAuthState("logged-in");
      } else {
        setAuthState("logged-out");
      }
    } catch (error) {
      console.error("Auth check error:", error);
      setAuthState("logged-out");
    }
  };

  const inputSchema = toolTemplate.inputSchema as any;

  // Check if schema has nested credentials/payload structure or flat structure
  const hasNestedStructure =
    inputSchema?.properties?.credentials || inputSchema?.properties?.payload;

  const payloadProperties = hasNestedStructure
    ? inputSchema?.properties?.payload?.properties || {}
    : inputSchema?.properties || {};
  const credentialProperties = hasNestedStructure
    ? inputSchema?.properties?.credentials?.properties || {}
    : {};
  const payloadRequired = hasNestedStructure
    ? inputSchema?.properties?.payload?.required || []
    : inputSchema?.required || [];
  const credentialRequired = hasNestedStructure
    ? inputSchema?.properties?.credentials?.required || []
    : [];

  const handleInputChange = (key: string, value: any) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
  };

  const parseError = (err: any): { title: string; message: string; details: string } => {
    const fullError = err.message || err.toString() || "Failed to execute tool";

    // Check for common error patterns
    if (fullError.includes("Invalid API Key") || fullError.includes("Unauthorized")) {
      return {
        title: "Authentication Error",
        message: "The API key provided is invalid or has expired.",
        details: fullError,
      };
    }

    if (fullError.includes("status 401")) {
      return {
        title: "Authentication Error",
        message: "Authentication failed. Please check your credentials.",
        details: fullError,
      };
    }

    if (fullError.includes("status 403")) {
      return {
        title: "Permission Denied",
        message: "You don't have permission to access this resource.",
        details: fullError,
      };
    }

    if (fullError.includes("status 404")) {
      return {
        title: "Resource Not Found",
        message: "The requested resource could not be found.",
        details: fullError,
      };
    }

    if (fullError.includes("status 429")) {
      return {
        title: "Rate Limit Exceeded",
        message: "Too many requests. Please wait and try again.",
        details: fullError,
      };
    }

    if (
      fullError.includes("status 500") ||
      fullError.includes("status 502") ||
      fullError.includes("status 503")
    ) {
      return {
        title: "Server Error",
        message: "The server encountered an error. Please try again later.",
        details: fullError,
      };
    }

    if (fullError.includes("Network") || fullError.includes("fetch")) {
      return {
        title: "Network Error",
        message: "Could not connect to the server. Check your internet connection.",
        details: fullError,
      };
    }

    if (fullError.includes("timeout")) {
      return {
        title: "Timeout",
        message: "The tool took too long to complete. Please try again.",
        details: fullError,
      };
    }

    // Default error
    return {
      title: "Execution Failed",
      message: fullError.split("\n")[0] || "An unexpected error occurred.",
      details: fullError,
    };
  };

  const handleExecute = async (
    credentials: Record<string, string>,
    payload: Record<string, any>,
  ) => {
    setLoading(true);
    setError(null);
    setResult(null);
    setModalOpen(false);

    // Store the submitted data for download
    setLastSubmittedData({ credentials, payload });

    try {
      const client = new SuperglueClient({
        endpoint: config.superglueEndpoint,
        apiKey: tokenRegistry.getToken(),
        apiEndpoint: config.apiEndpoint,
      });

      const toolResult = await client.executeWorkflow({
        tool: toolTemplate,
        payload,
        credentials,
      });

      setResult(toolResult);

      // If workflow execution returned an error, set it
      if (!toolResult.success && toolResult.error) {
        const parsedError = parseError({ message: toolResult.error });
        setError(JSON.stringify(parsedError));
      }
    } catch (err: any) {
      const parsedError = parseError(err);
      setError(JSON.stringify(parsedError));
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    // Build WorkflowArgs format
    const workflowArgs: any = {
      workflow: toolTemplate,
    };

    // Only include credentials/payload if form has been submitted
    if (lastSubmittedData) {
      if (hasNestedStructure) {
        // If nested structure, separate credentials and payload
        if (Object.keys(lastSubmittedData.credentials).length > 0) {
          workflowArgs.credentials = lastSubmittedData.credentials;
        }
        if (Object.keys(lastSubmittedData.payload).length > 0) {
          workflowArgs.payload = lastSubmittedData.payload;
        }
      } else {
        // If flat structure, add all values to payload
        if (Object.keys(lastSubmittedData.payload).length > 0) {
          workflowArgs.payload = lastSubmittedData.payload;
        }
      }
    }

    const blob = new Blob([JSON.stringify(workflowArgs, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${toolTemplate.id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Create the timeline items
  const timelineItems = [];

  // Always show Start card
  timelineItems.push({ type: "start" as const });

  toolTemplate.steps.forEach((step) => {
    timelineItems.push({ type: "step" as const, step });
  });

  // Final item is always "Tool Result" (combines transform + output)
  timelineItems.push({ type: "output" as const });

  const handleScroll = (direction: "prev" | "next") => {
    if (!scrollContainerRef.current) return;
    const scrollAmount = 300;
    const newScrollLeft =
      scrollContainerRef.current.scrollLeft + (direction === "next" ? scrollAmount : -scrollAmount);
    scrollContainerRef.current.scrollTo({ left: newScrollLeft, behavior: "smooth" });
  };

  // Show loading state
  if (authState === "checking") {
    return (
      <div className="flex items-center justify-center h-screen bg-white">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-black" />
          <div className="text-black font-medium">Checking authentication...</div>
        </div>
      </div>
    );
  }

  // Show login view if not authenticated
  if (authState === "logged-out") {
    return <EmbeddedLoginView onLoginSuccess={checkAuth} />;
  }

  // Show tool executor if authenticated
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: MARKETING_STYLES }} />
      <div className="embedded-container">
        <div>
          <div>
            <p className="text-gray-600 text-[16px] mb-6">{toolTemplate.description}</p>
            {/* Horizontal Step Timeline */}
            <div className="flex items-center gap-0 mb-6">
              <button
                onClick={() => handleScroll("prev")}
                className="shrink-0 h-9 w-9 flex items-center justify-center bg-white text-gray-500 border border-gray-200 rounded-full transition-all duration-[350ms] ease hover:!border-black hover:!text-black"
                title="Scroll Left"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div
                className="flex-1 overflow-x-auto [&::-webkit-scrollbar]:hidden"
                ref={scrollContainerRef}
                style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
              >
                <div className="relative px-4">
                  <div
                    className="flex justify-start items-center gap-3 py-3"
                    style={{ minHeight: "150px" }}
                  >
                    {timelineItems.map((item, index) => {
                      return (
                        <React.Fragment key={`timeline-${index}`}>
                          <div className="flex-shrink-0">
                            <div className="timeline-card p-4 w-[228px] h-[120px]">
                              {item.type === "start" ? (
                                <div className="flex flex-col items-center justify-center h-full leading-tight">
                                  <Play className="h-5 w-5 text-muted-foreground" />
                                  <span className="text-[11px] font-medium mt-1.5">Start</span>
                                  <span className="text-[10px] text-muted-foreground mt-0.5">
                                    Tool Input
                                  </span>
                                </div>
                              ) : item.type === "output" ? (
                                <div className="h-full flex flex-col justify-between">
                                  <div className="flex-1 min-h-0 flex flex-col items-center justify-center leading-tight">
                                    <Package className="h-5 w-5 text-muted-foreground" />
                                    <span className="text-[11px] font-medium mt-1.5">
                                      Tool Result
                                    </span>
                                    <span className="text-[10px] text-muted-foreground mt-0.5">
                                      Transform
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-center gap-1.5 mt-2">
                                    <div
                                      className={cn(
                                        "w-2 h-2 rounded-full",
                                        result?.success ? "bg-green-500" : "bg-gray-400",
                                      )}
                                    />
                                    <span className="text-xs text-muted-foreground">
                                      {result?.success ? "Completed" : "Pending"}
                                    </span>
                                  </div>
                                </div>
                              ) : item.type === "step" && item.step ? (
                                <div className="h-full flex flex-col justify-between">
                                  <div className="flex-1 min-h-0 flex flex-col items-center justify-center leading-tight">
                                    <Database className="h-5 w-5 text-muted-foreground mb-2" />
                                    <span className="text-[11px] font-medium text-center">
                                      {item.step.id}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-center gap-1.5 mt-2">
                                    <div
                                      className={cn(
                                        "w-2 h-2 rounded-full",
                                        result?.success ? "bg-green-500" : "bg-gray-400",
                                      )}
                                    />
                                    <span className="text-xs text-muted-foreground">
                                      {result?.success ? "Completed" : "Pending"}
                                    </span>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          </div>
                          {index < timelineItems.length - 1 && (
                            <div className="flex items-center justify-center mx-2">
                              <ChevronRight className="h-5 w-5 text-muted-foreground" />
                            </div>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>
              </div>

              <button
                onClick={() => handleScroll("next")}
                className="shrink-0 h-9 w-9 flex items-center justify-center bg-white text-gray-500 border border-gray-200 rounded-full transition-all duration-[350ms] ease hover:!border-black hover:!text-black"
                title="Scroll Right"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Results */}
            <div
              className={`mb-6 ${loading ? "loading-box" : error ? "error-box" : result ? "success-box" : ""}`}
            >
              {loading ? (
                <>
                  <h3
                    className="text-sm font-semibold mb-2 flex items-center gap-2"
                    style={{ color: "#3b82f6" }}
                  >
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Executing tool...
                  </h3>
                  <div className="text-sm" style={{ color: "#6b7280" }}>
                    Please wait while we process your request
                  </div>
                </>
              ) : error ? (
                (() => {
                  const parsedError = JSON.parse(error);
                  return (
                    <>
                      <h3 className="text-sm font-semibold mb-2" style={{ color: "#dc2626" }}>
                        {parsedError.title}
                      </h3>
                      <div className="text-sm mb-3" style={{ color: "#ef4444" }}>
                        {parsedError.message}
                      </div>
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs" style={{ color: "#6b7280" }}>
                          View technical details
                        </summary>
                        <pre
                          className="mt-2 p-3 overflow-auto max-h-64 text-xs font-mono"
                          style={{
                            background: "#f8f8f8",
                            border: "1px solid #e5e7eb",
                            color: "#dc2626",
                            borderRadius: "0",
                          }}
                        >
                          {parsedError.details}
                        </pre>
                      </details>
                    </>
                  );
                })()
              ) : result ? (
                <>
                  <h3 className="text-sm font-semibold mb-2" style={{ color: "#000" }}>
                    Execution Successful
                  </h3>
                  <div className="mt-3">
                    <div className="font-mono text-xs mb-2" style={{ color: "#6b7280" }}>
                      Response Data:
                    </div>
                    <pre
                      className="p-4 overflow-auto max-h-96 text-xs font-mono"
                      style={{
                        background: "#f8f8f8",
                        border: "1px solid #e5e7eb",
                        color: "#000",
                        borderRadius: "0",
                      }}
                    >
                      {JSON.stringify(result.data, null, 2)}
                    </pre>
                  </div>
                </>
              ) : null}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={handleDownload}
                className="flex items-center justify-center gap-3 bg-white text-black border border-gray-200 rounded-full px-[1.38rem] py-[.63rem] min-h-12 text-[.88rem] font-medium uppercase tracking-[-0.6px] leading-6 whitespace-nowrap transition-all duration-[350ms] ease hover:!bg-white hover:!border-black"
              >
                <Download className="h-4 w-4" />
                Download
              </button>
              <button
                onClick={() => setModalOpen(true)}
                disabled={loading}
                className="flex items-center justify-center gap-3 bg-black text-white border border-black rounded-full px-[1.38rem] py-[.63rem] min-h-12 text-[.88rem] font-medium uppercase tracking-[-0.6px] leading-6 whitespace-nowrap transition-all duration-[350ms] ease disabled:opacity-50 disabled:cursor-not-allowed hover:!bg-white hover:!text-black"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Executing...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    Execute
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        <EmbeddedConfigModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          loading={loading}
          onExecute={handleExecute}
          credentialProperties={credentialProperties}
          payloadProperties={payloadProperties}
          credentialRequired={credentialRequired}
          payloadRequired={payloadRequired}
          formValues={formValues}
          onInputChange={handleInputChange}
        />
      </div>
    </>
  );
}

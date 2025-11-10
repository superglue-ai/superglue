"use client";

import { useConfig } from "@/src/app/config-context";
import { useToast } from "@/src/hooks/use-toast";
import { useToken } from "@/src/hooks/use-token";
import { parseCredentialsHelper, splitUrl } from "@/src/lib/client-utils";
import { cn, composeUrl, inputErrorStyles } from "@/src/lib/general-utils";
import { tokenRegistry } from "@/src/lib/token-registry";
import {
  ApolloClient,
  gql,
  InMemoryCache,
  useSubscription,
} from "@apollo/client";
import { GraphQLWsLink } from "@apollo/client/link/subscriptions";
import { Label } from "@radix-ui/react-label";
import {
  ApiConfig,
  AuthType,
  CacheMode,
  SuperglueClient,
} from "@superglue/client";
import { integrations } from "@superglue/shared";
import { createClient } from "graphql-ws";
import { Copy, Loader2, Terminal, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { HelpTooltip } from "../utils/HelpTooltip";
import {
  API_CREATE_STEPS,
  StepIndicator,
  type StepperStep,
} from "../utils/StepIndicator";
import { URLField } from "../utils/URLField";
import { InteractiveApiPlayground } from "./InteractiveApiPlayground";

interface ConfigCreateStepperProps {
  configId?: string;
  mode?: "create" | "edit";
  prefillData?: {
    fullUrl: string;
    instruction: string;
    documentationUrl?: string;
  };
  onComplete?: () => void;
}

export function ConfigCreateStepper({
  configId: initialConfigId,
  mode = "create",
  prefillData,
  onComplete,
}: ConfigCreateStepperProps) {
  const [step, setStep] = useState<StepperStep>("basic");
  const [isAutofilling, setIsAutofilling] = useState(false);
  const { toast } = useToast();
  const router = useRouter();
  const superglueConfig = useConfig();

  const [configId, setConfigId] = useState<string>(initialConfigId || "");
  const [initialRawResponse, setInitialRawResponse] = useState<any>(null);
  const [hasMappedResponse, setHasMappedResponse] = useState(false);
  const [mappedResponseData, setMappedResponseData] = useState<any>(null);
  const [responseMapping, setResponseMapping] = useState<any>(null);
  const [isRunning, setIsRunning] = useState(false);

  const [formData, setFormData] = useState({
    fullUrl: prefillData?.fullUrl || "",
    instruction: prefillData?.instruction || "",
    documentationUrl: prefillData?.documentationUrl || "",
    inputPayload: "{}",
    auth: {
      type: AuthType.HEADER,
      value: "",
    },
    responseSchema: "{}",
  });
  const LOGS_SUBSCRIPTION = gql`
    subscription OnNewLog {
      logs {
        id
        message
        level
        timestamp
        runId
      }
    }
  `;
  const config = useConfig();

  const [validationErrors, setValidationErrors] = useState<
    Record<string, boolean>
  >({});

  const [docFile, setDocFile] = useState<File | null>(null);
  const [isDraggingDoc, setIsDraggingDoc] = useState(false);

  const [latestLog, setLatestLog] = useState<string>("");
  const token = useToken();

  const client = useMemo(() => {
    const wsLink = new GraphQLWsLink(
      createClient({
        url:
          config.superglueEndpoint
            ?.replace("https", "wss")
            ?.replace("http", "ws") || "ws://localhost:3000/graphql",
        connectionParams: {
          Authorization: `Bearer ${tokenRegistry.getToken()}`,
        },
        retryAttempts: Infinity,
        shouldRetry: () => true,
        retryWait: (retries) =>
          new Promise((resolve) =>
            setTimeout(resolve, Math.min(retries * 1000, 5000)),
          ),
        keepAlive: 10000, // Send keep-alive every 10 seconds
      }),
    );

    return new ApolloClient({
      link: wsLink,
      cache: new InMemoryCache(),
      defaultOptions: {
        watchQuery: {
          fetchPolicy: "no-cache",
        },
        query: {
          fetchPolicy: "no-cache",
        },
      },
    });
  }, [config.superglueEndpoint, token]);

  useEffect(() => {
    return () => {
      client.stop();
    };
  }, [client]);

  useSubscription(LOGS_SUBSCRIPTION, {
    client,
    shouldResubscribe: true,
    onError: (error) => {
      console.error("Subscription error:", error);
    },
    onData: ({ data }) => {
      if (data.data?.logs) {
        setLatestLog(data.data.logs.message);
      }
    },
  });

  const handleChange =
    (field: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | string) => {
      const value = typeof e === "string" ? e : e.target.value;
      setFormData((prev) => ({
        ...prev,
        [field]: value,
      }));

      // Reset hasMappedResponse and mappedResponseData when schema or instruction changes
      if (field === "responseSchema" || field === "instruction") {
        setHasMappedResponse(false);
        setMappedResponseData(null);
        setResponseMapping(null);
      }
    };

  const handleAuthChange = (value: string) => {
    setFormData((prev) => ({
      ...prev,
      auth: {
        ...prev.auth,
        value,
      },
    }));
  };

  const handleNext = async () => {
    if (step === "basic") {
      const errors: Record<string, boolean> = {};

      if (!formData.fullUrl) {
        errors.fullUrl = true;
      }
      if (!formData.instruction) {
        errors.instruction = true;
      }

      if (Object.keys(errors).length > 0) {
        setValidationErrors(errors);
        // Find first error field and scroll to it
        const firstErrorField = Object.keys(errors)[0];
        const errorElement = document.getElementById(firstErrorField);
        if (errorElement) {
          errorElement.scrollIntoView({ behavior: "smooth", block: "center" });
          errorElement.focus();
        }
        return;
      }
      setValidationErrors({});

      // Parse the URL when moving to the next step
      const url = splitUrl(formData.fullUrl);

      setIsAutofilling(true);
      try {
        const superglueClient = new SuperglueClient({
          endpoint: superglueConfig.superglueEndpoint,
          apiKey: tokenRegistry.getToken(),
        });

        // Call autofill endpoint
        const response = await superglueClient.call({
          endpoint: {
            id:
              url.urlHost
                ?.replace(/^(https?|postgres(ql)?|ftp(s)?|sftp|file):\/\//, "")
                .replace(/\//g, "") +
              "-" +
              Math.floor(1000 + Math.random() * 9000),
            urlHost: url.urlHost,
            ...(url.urlPath ? { urlPath: url.urlPath } : {}),
            ...(formData.documentationUrl
              ? { documentationUrl: formData.documentationUrl }
              : {}),
            instruction: formData.instruction,
            authentication: formData.auth.value
              ? AuthType.HEADER
              : AuthType.NONE,
          },
          payload: JSON.parse(formData.inputPayload),
          credentials: parseCredentialsHelper(formData.auth.value),
          options: {
            cacheMode: CacheMode.DISABLED,
          },
        });

        if (response.error) {
          throw new Error(response.error);
        }

        // Store the raw response for the try step
        setInitialRawResponse(response.data);

        // Generate schema based on the raw response

        const generatedSchema = await superglueClient.generateSchema(
          formData.instruction,
          JSON.stringify(response.data),
        );
        if (generatedSchema) {
          setFormData((prev) => ({
            ...prev,
            responseSchema: JSON.stringify(generatedSchema, null, 2),
          }));
        }

        // Apply the returned config
        const config = response.config as ApiConfig;
        if (config) {
          const id =
            url.urlHost
              ?.replace(/^(https?|postgres(ql)?|ftp(s)?|sftp|file):\/\//, "")
              .replace(/\//g, "") +
            "-" +
            Math.floor(1000 + Math.random() * 9000);
          setConfigId(id);

          // Save the configuration with the generated schema
          const savedConfig = await superglueClient.upsertApi(id, {
            id,
            ...config,
            responseSchema: generatedSchema,
            createdAt: new Date(),
            updatedAt: new Date(),
          } as ApiConfig);

          if (!savedConfig) {
            throw new Error("Failed to save configuration");
          }
        }
      } catch (error: any) {
        console.error("Error during autofill:", error);
        toast({
          title: "API Configuration Failed",
          description:
            error?.message || "An error occurred while configuring the API",
          variant: "destructive",
          duration: 10000,
        });
        return;
      } finally {
        setIsAutofilling(false);
      }
    }

    if (step === "try_and_output") {
      // Save the configuration with the updated schema
      try {
        const superglueClient = new SuperglueClient({
          endpoint: superglueConfig.superglueEndpoint,
          apiKey: tokenRegistry.getToken(),
        });
        const url = splitUrl(formData.fullUrl);
        const savedConfig = await superglueClient.upsertApi(configId, {
          id: configId,
          urlHost: url.urlHost,
          instruction: formData.instruction,
          documentationUrl: formData.documentationUrl || undefined,
          responseMapping: responseMapping,
          responseSchema: JSON.parse(formData.responseSchema),
          createdAt: new Date(),
          updatedAt: new Date(),
        } as ApiConfig);

        if (!savedConfig) {
          throw new Error("Failed to save configuration");
        }
      } catch (error: any) {
        console.error("Error saving config:", error);
        toast({
          title: "Error Saving Configuration",
          description:
            error?.message ||
            "An error occurred while saving the configuration",
          variant: "destructive",
        });
        return;
      }
    }

    const steps: StepperStep[] = ["basic", "try_and_output", "save"];
    const currentIndex = steps.indexOf(step);
    if (currentIndex < steps.length - 1) {
      setStep(steps[currentIndex + 1]);
    }
  };

  const handleBack = () => {
    const steps: StepperStep[] = ["basic", "try_and_output", "save"];
    const currentIndex = steps.indexOf(step);
    if (currentIndex > 0) {
      setStep(steps[currentIndex - 1]);
    }
  };
  const handleManualCreate = () => {
    router.push("/configs/manual-new");
  };
  const handleClose = () => {
    if (mode === "create") {
      router.push("/configs");
    } else {
      router.push(`/configs/${configId}/edit`);
    }
  };

  const getCurlCommand = () => {
    let payload = {};
    try {
      payload = JSON.parse(formData.inputPayload);
    } catch (e) {
      console.warn("Invalid input payload JSON");
    }

    const credentials = parseCredentialsHelper(formData.auth.value);

    const graphqlQuery = {
      query: `mutation CallApi($payload: JSON!, $credentials: JSON!) { 
  call(input: { id: "${configId}" }, payload: $payload, credentials: $credentials) { 
    data 
  } 
}`,
      variables: {
        payload,
        credentials,
      },
    };

    const command = `curl -X POST "${superglueConfig.superglueEndpoint}/graphql" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${tokenRegistry.getToken()}" \\
  -d '${JSON.stringify(graphqlQuery)}'`;

    return command;
  };

  const getSdkCode = () => {
    const credentials = parseCredentialsHelper(formData.auth.value);
    return `npm install @superglue/client

// in your app:
import { SuperglueClient } from "@superglue/client";
const superglue = new SuperglueClient({
  apiKey: "${tokenRegistry.getToken()}"
});

// Transform any API response with a single call
const result = await superglue.call({ 
  id: "${configId}",
  payload: ${formData.inputPayload},
  credentials: ${JSON.stringify(credentials)}
})`;
  };

  // Update handleMappedResponse to store the response data
  const handleMappedResponse = (response: any) => {
    setMappedResponseData(response);
    setHasMappedResponse(!!response && typeof response === "object");
  };

  const handleRun = async () => {
    // TODO: dedupe this InteractiveApiPlayground
    setIsRunning(true);
    try {
      const superglueClient = new SuperglueClient({
        endpoint: superglueConfig.superglueEndpoint,
        apiKey: tokenRegistry.getToken(),
      });

      // 1. First upsert the API config with the new schema and instruction
      await superglueClient.upsertApi(configId, {
        id: configId,
        instruction: formData.instruction,
        responseSchema: JSON.parse(formData.responseSchema),
        responseMapping: null,
      });

      // 2. Call the API using the config ID and get mapped response
      const mappedResult = await superglueClient.call({
        id: configId,
        payload: JSON.parse(formData.inputPayload),
        credentials: parseCredentialsHelper(formData.auth.value),
      });

      if (mappedResult.error) {
        throw new Error(mappedResult.error);
      }

      // 3. Set the mapped response
      const mappedData = mappedResult.data;
      setMappedResponseData(mappedData);
      setHasMappedResponse(true);
      setResponseMapping((mappedResult.config as ApiConfig).responseMapping);
    } catch (error: any) {
      console.error("Error running API:", error);
      toast({
        title: "Error Running API",
        description:
          error?.message || "An error occurred while running the API",
        variant: "destructive",
      });
    } finally {
      setIsRunning(false);
    }
  };

  // Add these handlers for documentation file upload
  const handleDocDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingDoc(true);
  };

  const handleDocDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingDoc(false);
  };

  const extractTextFromFile = async (file: File): Promise<string> => {
    if (file.type === "application/pdf") {
      // For PDFs, use pdf.js
      const pdfjsLib = await import("pdfjs-dist");
      // Update worker path to use .mjs extension
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

      let fullText = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(" ");
        fullText += pageText + "\n";
      }
      return fullText;
    } else {
      // For text files (.txt, .md, etc)
      return await file.text();
    }
  };

  const handleDocDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingDoc(false);

    const file = e.dataTransfer.files[0];
    if (!file) return;

    try {
      const extractedText = await extractTextFromFile(file);
      setDocFile(file);
      // Store the extracted text in formData for later use
      setFormData((prev) => ({
        ...prev,
        documentationUrl: extractedText,
      }));
    } catch (error) {
      console.error("Error extracting text from file:", error);
      toast({
        title: "Error Processing File",
        description: "Could not extract text from the uploaded file",
        variant: "destructive",
      });
    }
  };

  const handleDocFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const extractedText = await extractTextFromFile(file);
      setDocFile(file);
      // Store the extracted text in formData for later use
      setFormData((prev) => ({
        ...prev,
        documentationUrl: extractedText,
      }));
    } catch (error) {
      console.error("Error extracting text from file:", error);
      toast({
        title: "Error Processing File",
        description: "Could not extract text from the uploaded file",
        variant: "destructive",
      });
    }
  };

  // Update form data when prefillData changes or when modal is opened
  useEffect(() => {
    if (prefillData) {
      setFormData((prevData) => ({
        ...prevData,
        fullUrl: prefillData.fullUrl || prevData.fullUrl,
        instruction: prefillData.instruction || prevData.instruction,
        documentationUrl:
          prefillData.documentationUrl || prevData.documentationUrl,
      }));
    }
  }, [prefillData]);

  useSubscription(LOGS_SUBSCRIPTION, {
    client,
    shouldResubscribe: true,
    onError: (error) => {
      console.error("Subscription error:", error);
    },
    onData: ({ data }) => {
      if (data.data?.logs) {
        setLatestLog(data.data.logs.message);
      }
    },
  });

  // Add a new function to handle URL changes from URLField
  const handleUrlChange = (
    urlHost: string,
    urlPath: string,
    queryParams: Record<string, string>,
  ) => {
    const fullUrl = urlHost + (urlPath || "");

    setFormData((prev) => ({
      ...prev,
      fullUrl,
    }));

    // Auto-fill documentation URL if it's empty
    if (!formData.documentationUrl && urlHost) {
      // Check if URL matches any pattern in integrations
      const fullUrl = composeUrl(urlHost, urlPath);
      for (const pattern in integrations) {
        if (new RegExp(pattern).test(fullUrl)) {
          setFormData((prev) => ({
            ...prev,
            fullUrl,
            documentationUrl: integrations[pattern].docsUrl,
          }));
          break;
        }
      }
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full p-6">
      <div className="flex-none mb-4">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-4 mb-4">
          <h1 className="text-2xl font-semibold">
            {step === "save"
              ? "Configuration Complete!"
              : "Create New API Configuration"}
          </h1>
          <div className="flex items-center gap-2">
            {!step.includes("success") && (
              <Button
                variant="outline"
                className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-200/50 hover:border-blue-300/50 text-blue-600 hover:text-blue-700 text-sm px-4 py-1 h-8 rounded-full animate-pulse shrink-0"
                onClick={() =>
                  window.open("https://cal.com/superglue/onboarding", "_blank")
                }
              >
                ✨ Get help from our team
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0"
              onClick={() => {
                router.push("/configs");
                if (onComplete) {
                  onComplete();
                }
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <StepIndicator currentStep={step} steps={API_CREATE_STEPS} />
      </div>

      <div className="flex-1 overflow-y-auto px-1 min-h-0">
        {step === "basic" && (
          <div className="space-y-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Label htmlFor="fullUrl">API Endpoint URL</Label>
                <HelpTooltip text="The API URL (e.g., https://api.example.com/v1). Don't include the endpoint, e.g. /books/list, we figure it out." />
              </div>
              <URLField
                url={formData.fullUrl}
                onUrlChange={handleUrlChange}
                placeholder="https://api.example.com/v1"
                error={!!validationErrors.fullUrl}
                required
              />
              {validationErrors.fullUrl && (
                <p className="text-sm text-destructive mt-1">
                  API endpoint URL is required
                </p>
              )}
            </div>

            <div>
              <div className="flex items-center gap-2 mb-1">
                <Label htmlFor="documentationUrl">API Documentation</Label>
                <HelpTooltip text="Link to the API's documentation or upload a documentation file" />
              </div>

              {docFile ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 flex items-center gap-3 bg-blue-500/10 px-4 py-2 rounded-lg max-w-[calc(100%-5.5rem)]">
                    <Upload className="h-4 w-4 text-blue-500 shrink-0" />
                    <span className="text-white font-medium text-sm truncate">
                      {formData.documentationUrl.slice(0, 300)}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0 text-muted-foreground hover:text-destructive transition-colors w-20"
                    onClick={() => {
                      setFormData((prev) => ({
                        ...prev,
                        documentationUrl: "",
                      }));
                      setDocFile(null);
                    }}
                  >
                    Remove
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    id="documentationUrl"
                    value={formData.documentationUrl}
                    onChange={handleChange("documentationUrl")}
                    placeholder="https://docs.example.com"
                    className="flex-1"
                  />
                  <div
                    className={cn(
                      "relative shrink-0",
                      isDraggingDoc &&
                        "after:absolute after:inset-0 after:bg-primary/5 after:backdrop-blur-[1px] after:rounded-lg after:border-2 after:border-primary",
                    )}
                    onDragOver={handleDocDragOver}
                    onDragLeave={handleDocDragLeave}
                    onDrop={handleDocDrop}
                  >
                    <Button
                      variant="outline"
                      className="h-9"
                      onClick={() =>
                        document.getElementById("doc-file-upload")?.click()
                      }
                    >
                      Upload Document
                    </Button>
                    <input
                      type="file"
                      id="doc-file-upload"
                      className="hidden"
                      onChange={handleDocFileUpload}
                      accept=".pdf,.txt,.md"
                    />
                  </div>
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center gap-2 mb-1">
                <Label htmlFor="auth">API Key or Token (Optional)</Label>
                <HelpTooltip text="Enter API secret here (not stored, just for initial setup). Omit prefixes like Bearer. Alternatively, you can put a JSON object here with multiple keys and values." />
              </div>
              <Input
                id="auth"
                value={formData.auth.value}
                onChange={(e) => handleAuthChange(e.target.value)}
                placeholder="Enter your API key or token"
              />
            </div>

            <div className="mt-6">
              <div className="flex items-center gap-2 mb-1">
                <Label htmlFor="instruction">
                  What do you want to get from this API?
                </Label>
                <HelpTooltip text="Describe what data you want to extract from this API in plain English" />
              </div>
              <Textarea
                id="instruction"
                value={formData.instruction}
                onChange={(e) => {
                  handleChange("instruction")(e);
                  if (e.target.value) {
                    setValidationErrors((prev) => ({
                      ...prev,
                      instruction: false,
                    }));
                  }
                }}
                placeholder="E.g. 'Get all products with price and name'"
                className={cn(
                  "h-48",
                  validationErrors.instruction && inputErrorStyles,
                  validationErrors.instruction && "focus:!border-destructive",
                )}
                required
              />
              {validationErrors.instruction && (
                <p className="text-sm text-destructive mt-1">
                  Instruction is required
                </p>
              )}
            </div>
          </div>
        )}

        {step === "try_and_output" && configId && (
          <div className="space-y-2 h-full">
            <InteractiveApiPlayground
              configId={configId}
              instruction={formData.instruction}
              onInstructionChange={handleChange("instruction")}
              responseSchema={formData.responseSchema}
              onResponseSchemaChange={handleChange("responseSchema")}
              initialRawResponse={initialRawResponse}
              onMappedResponse={handleMappedResponse}
              onRun={handleRun}
              isRunning={isRunning}
              mappedResponseData={mappedResponseData}
              responseMapping={responseMapping}
              hideRunButton={true}
            />
          </div>
        )}

        {step === "save" && (
          <div className="space-y-4 h-full">
            <p className="text-m font-medium">Done!</p>
            <p className="text-sm font-medium">
              You can now call the endpoint from your app. The call is proxied
              to the targeted endpoint without AI inbewteen. Predictable and
              millisecond latency.
            </p>
            <div className="rounded-md bg-muted p-4">
              <div className="flex items-start space-x-2">
                <Terminal className="mt-0.5 h-5 w-5 text-muted-foreground shrink-0" />
                <div className="space-y-1 w-full">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">
                      Try the endpoint locally with curl:{" "}
                    </p>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 flex-none"
                      onClick={() => {
                        navigator.clipboard.writeText(getCurlCommand());
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="relative">
                    <pre className="rounded-lg bg-secondary p-4 text-sm overflow-x-auto whitespace-pre-wrap break-all">
                      <code>{getCurlCommand()}</code>
                    </pre>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-md bg-muted p-4">
              <div className="flex items-start space-x-2">
                <Terminal className="mt-0.5 h-5 w-5 text-muted-foreground shrink-0" />
                <div className="space-y-1 w-full">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">
                      Or use the TypeScript SDK in your application:{" "}
                    </p>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 flex-none"
                      onClick={() => {
                        navigator.clipboard.writeText(getSdkCode());
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="relative">
                    <pre className="rounded-lg bg-secondary p-4 text-sm overflow-x-auto whitespace-pre-wrap break-all">
                      <code>{getSdkCode()}</code>
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex-none mt-2 sm:mt-4 flex flex-col lg:flex-row gap-2 justify-between">
        {step === "save" ? (
          <>
            <Button variant="outline" onClick={handleBack}>
              Back
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  router.push(`/configs/${configId}/edit`);
                }}
              >
                Advanced Edit
              </Button>
              <Button
                onClick={() => {
                  router.push("/configs");
                  // Call onComplete before closing if provided
                  if (onComplete) {
                    onComplete();
                  }
                }}
              >
                Done
              </Button>
            </div>
          </>
        ) : (
          <>
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={step === "basic"}
            >
              Back
            </Button>
            <div className="flex gap-2">
              {step === "basic" && (
                <Button variant="outline" onClick={handleManualCreate}>
                  Manual Configuration
                </Button>
              )}
              <Button
                onClick={
                  step === "try_and_output" && !mappedResponseData
                    ? handleRun
                    : handleNext
                }
                disabled={
                  isAutofilling ||
                  (step === "try_and_output" &&
                    !mappedResponseData &&
                    isRunning)
                }
                className="animate-pulse"
              >
                {isAutofilling ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {latestLog
                      ? latestLog
                          ?.split(" ")
                          .slice(0, 4)
                          .join(" ")
                          .slice(0, 30) + "..."
                      : "Creating configuration..."}
                  </>
                ) : step === "try_and_output" ? (
                  isRunning ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {latestLog
                        ? latestLog
                            ?.split(" ")
                            .slice(0, 4)
                            .join(" ")
                            .slice(0, 30) + "..."
                        : "Creating transformation..."}
                    </>
                  ) : !mappedResponseData ? (
                    <>
                      <span>✨ Run</span>
                    </>
                  ) : (
                    "Complete"
                  )
                ) : (
                  "Next"
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

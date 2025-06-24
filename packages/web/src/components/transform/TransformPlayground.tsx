"use client";

import { useConfig } from "@/src/app/config-context";
import JsonSchemaEditor from "@/src/components/utils/JsonSchemaEditor";
import { WorkflowResultsView } from "@/src/components/workflow/WorkflowResultsView";
import { CacheMode, SuperglueClient, TransformResult, WorkflowResult } from "@superglue/client";
import { X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from "react";
import { useToast } from "../../hooks/use-toast";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";

type InputType = 'raw' | 'url' | 'file';

interface SavedInputData {
    inputType: InputType;
    rawData: string;
    inputUrl: string;
    fileName?: string;
}

// Utility to detect binary file formats that need extraction
const isBinaryFile = (filename: string): boolean => {
    const binaryExtensions = [
        '.xlsx', '.xls', '.xlsm', '.xlsb',  // Excel formats
        '.docx', '.doc', '.docm',          // Word formats  
        '.pptx', '.ppt', '.pptm',          // PowerPoint formats
        '.zip', '.rar', '.7z',             // Archive formats
        '.pdf',                            // PDF format
        '.odt', '.ods', '.odp',            // OpenDocument formats
    ];

    const ext = filename.toLowerCase().split('.').pop();
    return binaryExtensions.includes(`.${ext}`);
};

// Cookie utility functions
const saveInputDataToCookie = (transformId: string, inputData: SavedInputData) => {
    if (!transformId) return;

    const cookieName = `transform_input_${transformId}`;
    const cookieValue = JSON.stringify(inputData);

    // Set cookie with 30 days expiration
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + 30);

    document.cookie = `${cookieName}=${encodeURIComponent(cookieValue)}; expires=${expirationDate.toUTCString()}; path=/`;
};

const loadInputDataFromCookie = (transformId: string): SavedInputData | null => {
    if (!transformId) return null;

    const cookieName = `transform_input_${transformId}`;
    const cookies = document.cookie.split(';');

    for (const cookie of cookies) {
        const [name, value] = cookie.trim().split('=');
        if (name === cookieName) {
            try {
                return JSON.parse(decodeURIComponent(value));
            } catch (error) {
                console.error('Error parsing cookie data:', error);
                return null;
            }
        }
    }

    return null;
};

export default function TransformPlayground({ id }: { id?: string }) {
    const router = useRouter();
    const { toast } = useToast();
    const config = useConfig();

    // Transform identification
    const [transformId, setTransformId] = useState(id || '');

    // Input configuration
    const [inputType, setInputType] = useState<InputType>('raw');
    const [rawData, setRawData] = useState('');
    const [inputUrl, setInputUrl] = useState('');
    const [inputFile, setInputFile] = useState<File | null>(null);

    // Transform configuration
    const [transform, setTransform] = useState(`(sourceData) => {\n   return sourceData;\n}`);
    const [instruction, setInstruction] = useState('');
    const [responseSchema, setResponseSchema] = useState<string | null>(``);

    // Execution state
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [result, setResult] = useState<WorkflowResult | null>(null);
    const [activeResultTab, setActiveResultTab] = useState<'results' | 'transform' | 'final' | 'instructions'>('results');
    const [executionError, setExecutionError] = useState<string | null>(null);

    const fillJsonExample = () => {
        setInputType('raw');
        setRawData(`[
  {"fullName": "Alice Johnson", "birthDate": "2010-03-15", "department": "Engineering"},
  {"fullName": "Bob Smith", "birthDate": "1993-07-22", "department": "Marketing"},
  {"fullName": "Charlie Brown", "birthDate": "1988-11-08", "department": "Sales"}
]`);
        setResponseSchema(`{
  "properties": {
    "results": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "firstName": {
            "type": "string"
          },
          "lastName": {
            "type": "string"
          },
          "age": {
            "type": "number"
          },
          "isAdult": {
            "type": "boolean"
          }
        },
        "required": [
          "firstName",
          "lastName",
          "age",
          "isAdult"
        ]
      }
    }
  },
  "type": "object",
  "required": [
    "results"
  ]
}`);
        toast({
            title: "Example loaded",
            description: "JSON transformation example has been loaded",
        });
    };

    const loadTransform = async (idToLoad: string) => {
        try {
            if (!idToLoad) return;

            setLoading(true);
            setResult(null);
            setExecutionError(null);

            const superglueClient = new SuperglueClient({
                endpoint: config.superglueEndpoint,
                apiKey: config.superglueApiKey,
            });

            const transformConfig = await superglueClient.getTransform(idToLoad);
            if (!transformConfig) {
                throw new Error(`Transform with ID "${idToLoad}" not found.`);
            }

            console.log(transformConfig);
            setTransformId(transformConfig.id);
            setInstruction(transformConfig.instruction || '');
            setTransform(transformConfig.responseMapping || '');

            if (transformConfig.responseSchema === null || transformConfig.responseSchema === undefined) {
                setResponseSchema(null);
            } else {
                setResponseSchema(JSON.stringify(transformConfig.responseSchema));
            }

            // Load saved input data from cookie
            const savedInputData = loadInputDataFromCookie(idToLoad);
            if (savedInputData) {
                setInputType(savedInputData.inputType);
                setRawData(savedInputData.rawData);
                setInputUrl(savedInputData.inputUrl);

                // For file input, we can't restore the actual file, but we can show the filename
                if (savedInputData.inputType === 'file' && savedInputData.fileName) {
                    // Clear the file input but show a message about the previous file
                    setInputFile(null);
                    toast({
                        title: "Previous file reference found",
                        description: `Previously used file: ${savedInputData.fileName}`,
                    });
                }
            }

            toast({
                title: "Transform loaded",
                description: `Loaded "${transformConfig.id}" successfully`,
            });
        } catch (error: any) {
            console.error("Error loading transform:", error);
            toast({
                title: "Error loading transform",
                description: error.message,
                variant: "destructive",
            });
            // Reset state, keeping the attempted ID in the input field for convenience
            setInstruction('');
            setTransform(`(sourceData) => {\n   return sourceData;\n}`);
            setResponseSchema(null);
            setResult(null);
            setExecutionError(null);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (id) {
            loadTransform(id);
        } else {
            // Reset to a clean slate if id is removed or not provided
            setTransformId('');
            setInstruction('');
            setTransform(`(sourceData) => {\n   return sourceData;\n}`);
            setResponseSchema(null);
            setResult(null);
            setExecutionError(null);
        }
    }, [id]);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            setInputFile(file);
        }
    };

    const saveTransform = async () => {
        try {
            const savingId = transformId || `transform-${Date.now()}`;
            setSaving(true);

            const transformData = {
                id: savingId,
                instruction: instruction,
                responseMapping: transform,
                responseSchema: responseSchema ? JSON.parse(responseSchema) : undefined
            };

            const superglueClient = new SuperglueClient({
                endpoint: config.superglueEndpoint,
                apiKey: config.superglueApiKey,
            });

            await superglueClient.upsertTransformation(savingId, transformData);

            // Save input data to cookie
            const inputDataToSave: SavedInputData = {
                inputType,
                rawData,
                inputUrl,
                fileName: inputFile?.name
            };
            saveInputDataToCookie(savingId, inputDataToSave);

            toast({
                title: "Transform saved",
                description: `"${savingId}" saved successfully`,
            });
            router.push(`/transforms/${savingId}`);
        } catch (error: any) {
            console.error("Error saving transform:", error);
            toast({
                title: "Error saving transform",
                description: error.message,
                variant: "destructive",
            });
        } finally {
            setSaving(false);
        }
    };

    const executeTransform = async () => {
        const startTime = new Date();
        let inputData: any;
        try {
            setLoading(true);
            setResult(null);
            setExecutionError(null);

            // Save input data to cookie before execution
            if (transformId) {
                const inputDataToSave: SavedInputData = {
                    inputType,
                    rawData,
                    inputUrl,
                    fileName: inputFile?.name
                };
                saveInputDataToCookie(transformId, inputDataToSave);
            }

            const superglueClient = new SuperglueClient({
                endpoint: config.superglueEndpoint,
                apiKey: config.superglueApiKey,
            });

            // Prepare input based on type
            switch (inputType) {
                case 'raw':
                    inputData = rawData;
                    break;
                case 'url':
                    if (!inputUrl.trim()) {
                        throw new Error('URL cannot be empty');
                    }
                    // Fetch data from URL
                    const response = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(inputUrl)}`);
                    if (!response.ok) {
                        throw new Error(`Failed to fetch data from URL: ${response.statusText}`);
                    }
                    const responseData = await response.json();
                    inputData = responseData.contents;
                    break;
                case 'file':
                    if (!inputFile) {
                        throw new Error('No file selected');
                    }

                    if (isBinaryFile(inputFile.name)) {
                        // Use extract to convert binary files to JSON first
                        const extractResult = await superglueClient.extract({
                            file: inputFile,
                            endpoint: {
                                id: `extract-${Date.now()}`,
                                instruction: "Extract structured data from this file"
                            }
                        });

                        if (!extractResult.success) {
                            throw new Error(`Failed to extract data from binary file: ${extractResult.error}`);
                        }

                        inputData = extractResult.data;
                    } else {
                        // Handle text files normally
                        const fileContent = await inputFile.text();
                        inputData = fileContent;
                    }
                    break;
                default:
                    throw new Error('Invalid input type');
            }

            // Execute transform
            let transformResult: TransformResult & { data: any };
            if (inputType === 'raw' || inputType === 'file') {
                transformResult = await superglueClient.transform({
                    data: inputData,
                    endpoint: {
                        id: transformId,
                        instruction: instruction,
                        responseSchema: responseSchema ? JSON.parse(responseSchema) : undefined,
                        responseMapping: transform
                    }
                });
            } else if (inputType === 'url') {
                transformResult = await superglueClient.transform({
                    data: inputData,
                    endpoint: {
                        id: transformId,
                        instruction: instruction,
                        responseMapping: transform,
                        responseSchema: responseSchema ? JSON.parse(responseSchema) : undefined
                    },
                    options: {
                        cacheMode: CacheMode.DISABLED
                    }
                });
            } else {
                throw new Error('Invalid input type');
            }

            const endTime = new Date();
            setResult({
                success: transformResult.success,
                data: transformResult.data,
                startedAt: transformResult.startedAt,
                completedAt: transformResult.completedAt,
                config: {
                    steps: [],
                    ...transformResult.config
                },
                stepResults: [{
                    stepId: transformId || 'transform',
                    success: transformResult.success,
                    rawData: inputData,
                    transformedData: transformResult.data,
                    error: null
                }],
                id: transformId || 'transform'
            });
            setTransform(transformResult.config?.responseMapping || '');
            setActiveResultTab('final');
        } catch (error: any) {
            console.error("Error executing transform:", error);
            const endTime = new Date();
            setResult({
                success: false,
                error: error.message,
                startedAt: startTime,
                completedAt: endTime,
                config: {
                    steps: [],
                    id: transformId || 'transform'
                },
                stepResults: [{
                    stepId: transformId || 'transform',
                    success: false,
                    rawData: inputData,
                    transformedData: null,
                    error: error.message
                }],
                id: transformId || 'transform'
            });
            setExecutionError(error.message);
            toast({
                title: "Error executing transform",
                description: error.message,
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const isInputEmpty = () => {
        switch (inputType) {
            case 'raw':
                return !rawData.trim();
            case 'url':
                return !inputUrl.trim();
            case 'file':
                return !inputFile;
            default:
                return true;
        }
    };

    const renderInputSection = () => {
        return (
            <div className="space-y-4">
                {/* Transform ID */}
                <div className="mb-3">
                    <div className="flex items-center justify-between mb-1">
                        <Label htmlFor="transformId">Transform ID</Label>
                    </div>
                    <div className="flex items-center gap-2">
                        <Input
                            id="transformId"
                            value={transformId}
                            onChange={(e) => setTransformId(e.target.value)}
                            placeholder="Enter transform ID to load or save"
                            className="flex-grow"
                        />
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => loadTransform(transformId)}
                            disabled={loading || saving || !transformId}
                            className="flex-shrink-0"
                        >
                            {loading && !saving ? "Loading..." : "Load"}
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={fillJsonExample}
                            disabled={loading || saving}
                            className="flex-shrink-0"
                        >
                            Example
                        </Button>
                    </div>
                </div>

                {/* Instruction */}
                <div>
                    <Label htmlFor="instruction" className="mb-1 block">Instruction</Label>
                    <Input
                        id="instruction"
                        value={instruction}
                        onChange={(e) => setInstruction(e.target.value)}
                        placeholder="Transform to the new schema"
                        className="text-sm"
                    />
                </div>
                <div>
                    <Label className="mb-3 block">Input Type</Label>
                    <div className="grid grid-cols-3 gap-1 p-1 border rounded-lg">
                        <Button
                            variant={inputType === 'raw' ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => setInputType('raw')}
                            className="text-sm font-medium"
                        >
                            Raw Data
                        </Button>
                        <Button
                            variant={inputType === 'url' ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => setInputType('url')}
                            className="text-sm font-medium"
                        >
                            URL
                        </Button>
                        <Button
                            variant={inputType === 'file' ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => setInputType('file')}
                            className="text-sm font-medium"
                        >
                            File Upload
                        </Button>
                    </div>
                </div>

                {
                    inputType === 'raw' && (
                        <div>
                            <Label htmlFor="rawData" className="mb-1 block">Raw Data (JSON, XML, CSV)</Label>
                            <Textarea
                                id="rawData"
                                value={rawData}
                                onChange={(e) => setRawData(e.target.value)}
                                placeholder="Enter data"
                                className="font-mono text-xs min-h-[200px]"
                            />
                            {!rawData.trim() && (
                                <div className="text-xs text-amber-800 dark:text-amber-300 flex items-center gap-1.5 bg-amber-500/10 py-1 px-2 rounded mt-1">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                        <line x1="12" y1="9" x2="12" y2="13" />
                                        <line x1="12" y1="17" x2="12.01" y2="17" />
                                    </svg>
                                    No data provided
                                </div>
                            )}
                        </div>
                    )}

                {
                    inputType === 'url' && (
                        <div>
                            <Label htmlFor="inputUrl" className="mb-1 block">File URL (JSON, XML, CSV)</Label>
                            <Input
                                id="inputUrl"
                                type="url"
                                value={inputUrl}
                                onChange={(e) => setInputUrl(e.target.value)}
                                placeholder="https://api.example.com/data"
                            />
                            {!inputUrl.trim() && (
                                <div className="text-xs text-amber-800 dark:text-amber-300 flex items-center gap-1.5 bg-amber-500/10 py-1 px-2 rounded mt-1">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                        <line x1="12" y1="9" x2="12" y2="13" />
                                        <line x1="12" y1="17" x2="12.01" y2="17" />
                                    </svg>
                                    No URL provided
                                </div>
                            )}
                        </div>
                    )}

                {
                    inputType === 'file' && (
                        <div>
                            <Label htmlFor="inputFile" className="mb-1 block">Upload File (JSON, XML, CSV, Excel)</Label>
                            <Input
                                id="inputFile"
                                type="file"
                                accept=".json,.txt,.csv,.xml,.xlsx"
                                onChange={handleFileChange}
                            />
                            {inputFile && (
                                <p className="text-xs text-gray-500 mt-1">
                                    Selected: {inputFile.name} ({(inputFile.size / 1024).toFixed(1)} KB)
                                </p>
                            )}
                            {!inputFile && (
                                <div className="text-xs text-amber-800 dark:text-amber-300 flex items-center gap-1.5 bg-amber-500/10 py-1 px-2 rounded mt-1">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                        <line x1="12" y1="9" x2="12" y2="13" />
                                        <line x1="12" y1="17" x2="12.01" y2="17" />
                                    </svg>
                                    No file selected
                                </div>
                            )}
                        </div>
                    )}
            </div>
        );
    };
    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center justify-between mb-4">
                <h1 className="text-2xl font-semibold">Create New Transform</h1>
                <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={() => router.push('/configs')}
                >
                    <X className="h-4 w-4" />
                </Button>
            </div>
            <div className="p-6 max-w-none w-full">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Left Column - Transform Configuration */}
                    <Card className="flex flex-col">
                        <CardContent className="p-4 overflow-auto flex-grow space-y-4">
                            {/* Input Section */}
                            {renderInputSection()}

                            {/* Response Schema */}
                            <div className="flex-1 flex flex-col min-h-0">
                                <JsonSchemaEditor
                                    isOptional={true}
                                    value={responseSchema}
                                    onChange={setResponseSchema}
                                />
                            </div>
                            {/* Save and Execute Buttons */}
                            <div className="flex gap-2 -mt-4 mb-4">
                                <Button
                                    variant="outline"
                                    onClick={saveTransform}
                                    disabled={saving || loading}
                                    className="w-full"
                                >
                                    {saving ? "Saving..." : "Save Transform"}
                                </Button>
                                <Button
                                    onClick={executeTransform}
                                    disabled={loading || saving || isInputEmpty()}
                                    className="w-full"
                                >
                                    {loading ? "Transforming..." : "Execute Transform"}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Right Column - Results */}
                    <WorkflowResultsView
                        activeTab={activeResultTab}
                        setActiveTab={setActiveResultTab}
                        executionResult={result}
                        finalTransform={transform}
                        setFinalTransform={setTransform}
                        finalResult={result?.data}
                        isExecuting={loading}
                        executionError={executionError}
                    />
                </div>
            </div>
        </div>
    );
}

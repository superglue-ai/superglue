import JsonSchemaEditor from '@/src/components/editors/JsonSchemaEditor';
import { Button } from '@/src/components/ui/button';
import { Card } from '@/src/components/ui/card';
import { FileChip } from '@/src/components/ui/FileChip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/src/components/ui/tabs';
import { HelpTooltip } from '@/src/components/utils/HelpTooltip';
import { formatBytes, isAllowedFileType, MAX_TOTAL_FILE_SIZE_TOOLS, type UploadedFileInfo } from '@/src/lib/file-utils';
import { ALLOWED_FILE_EXTENSIONS } from '@superglue/shared';
import { FileBraces, FileBracesCorner, FileJson, Upload } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { JsonCodeEditor } from '../../editors/JsonCodeEditor';

export const PayloadSpotlight = ({
    payloadText,
    inputSchema,
    onChange,
    onInputSchemaChange,
    readOnly,
    onFilesUpload,
    uploadedFiles = [],
    onFileRemove,
    isProcessingFiles = false,
    totalFileSize = 0,
    onUserEdit,
    isPayloadValid
}: {
    payloadText: string;
    inputSchema?: string | null;
    onChange?: (value: string) => void;
    onInputSchemaChange?: (value: string | null) => void;
    readOnly?: boolean;
    onFilesUpload?: (files: File[]) => Promise<void>;
    uploadedFiles?: UploadedFileInfo[];
    onFileRemove?: (fileName: string) => void;
    isProcessingFiles?: boolean;
    totalFileSize?: number;
    onUserEdit?: () => void;
    isPayloadValid?: boolean;
}) => {
    const [activeTab, setActiveTab] = useState('payload');
    const [localPayload, setLocalPayload] = useState<string>(payloadText || '');
    const [localInputSchema, setLocalInputSchema] = useState(inputSchema || null);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Simple sync with parent payload (parent is source of truth)
    useEffect(() => {
        setLocalPayload(payloadText || '');
    }, [payloadText]);

    useEffect(() => {
        setLocalInputSchema(inputSchema || null);
    }, [inputSchema]);

    const handlePayloadChange = (value: string) => {
        setLocalPayload(value);
        
        if (onUserEdit) {
            onUserEdit();
        }
        
        const trimmed = (value || '').trim();
        if (trimmed === '') {
            setError(null);
            if (onChange) onChange(value);
            return;
        }
        
        try {
            JSON.parse(value);
            setError(null);
            if (onChange) onChange(value);
        } catch {
            setError('Invalid JSON - will not be saved. Navigating away will revert to last valid JSON.');
        }
    };

    const handleSchemaChange = (value: string | null) => {
        setLocalInputSchema(value);
        if (onInputSchemaChange) onInputSchemaChange(value);
    };

    // Extract payload schema from full input schema for display in schema tab
    const extractPayloadSchemaForDisplay = (fullInputSchema: string | null): any | null => {
        if (!fullInputSchema || fullInputSchema.trim() === '') {
            return null;
        }
        try {
            const parsed = JSON.parse(fullInputSchema);
            if (parsed?.properties?.payload) {
                return parsed.properties.payload;
            }
            return parsed;
        } catch {
            return null;
        }
    };

    const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        const invalidFiles = files.filter(f => !isAllowedFileType(f.name));
        if (invalidFiles.length > 0) {
            setError(`Unsupported file types: ${invalidFiles.map(f => f.name).join(', ')}`);
            return;
        }

        if (onFilesUpload) {
            await onFilesUpload(files);
        }

        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    return (
        <>
            <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ALLOWED_FILE_EXTENSIONS.join(',')}
                onChange={handleFileInputChange}
                className="hidden"
            />
            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="h-9 p-1 rounded-md mb-3">
                    <TabsTrigger value="payload" className="h-full px-3 text-xs flex items-center gap-1 rounded-sm data-[state=active]:rounded-sm">
                        <FileJson className="h-4 w-4" /> Payload
                    </TabsTrigger>
                    {isPayloadValid && (
                        <TabsTrigger value="schema" className="h-full px-3 text-xs flex items-center gap-1 rounded-sm data-[state=active]:rounded-sm">
                            <FileBracesCorner className="h-4 w-4" /> Input Schema
                        </TabsTrigger>
                    )}
                    {!isPayloadValid && (
                        <TabsTrigger value="schema" className="h-full px-3 text-xs flex items-center gap-1 rounded-sm data-[state=active]:rounded-sm">
                            <FileBraces color="#FFA500" className="h-4 w-4" /> Input Schema
                        </TabsTrigger>
                    )}
                </TabsList>
                <TabsContent value="payload" className="mt-1 space-y-3">
                    {!readOnly && onFilesUpload && uploadedFiles.length > 0 && (
                        <div className="space-y-1.5">
                            {uploadedFiles.map(file => (
                                <FileChip
                                    key={file.key}
                                    file={file}
                                    onRemove={onFileRemove}
                                    size="default"
                                    rounded="md"
                                    showOriginalName={true}
                                    showKey={true}
                                />
                            ))}
                        </div>
                    )}
                    <span className="text-xs text-muted-foreground">
                        Enter your inputs here manually, or upload files to autofill missing JSON fields.
                    </span>
                    <div>
                        <JsonCodeEditor
                            value={localPayload}
                            onChange={(val) => handlePayloadChange(val || '')}
                            readOnly={!!readOnly}
                            maxHeight="300px"
                            resizable={true}
                            showValidation={true}
                        />
                    </div>
                    {!readOnly && onFilesUpload && (
                        <div className="pt-3 border-t border-border/50 space-y-3">
                            <div className="flex flex-col items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={isProcessingFiles || totalFileSize >= MAX_TOTAL_FILE_SIZE_TOOLS}
                                    className="h-9 px-4"
                                >
                                    {isProcessingFiles ? (
                                        <>
                                            <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent mr-2" />
                                            Processing Files...
                                        </>
                                    ) : (
                                        <>
                                            <Upload className="h-3.5 w-3.5 mr-2" />
                                            Upload Files
                                        </>
                                    )}
                                </Button>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <span>{formatBytes(totalFileSize)} / {formatBytes(MAX_TOTAL_FILE_SIZE_TOOLS)}</span>
                                    <HelpTooltip text="Upload CSV, JSON, XML, or Excel files. Files will be automatically parsed to JSON and merged with the manual payload when the tool executes." />
                                </div>
                            </div>
                        </div>
                    )}
                </TabsContent>
                <TabsContent value="schema" className="mt-3">
                    <JsonSchemaEditor
                        value={localInputSchema ? JSON.stringify(extractPayloadSchemaForDisplay(localInputSchema), null, 2) : localInputSchema}
                        onChange={(value) => {
                            if (value && value.trim() !== '') {
                                try {
                                    const payloadSchema = JSON.parse(value);
                                    const fullSchema = {
                                        type: 'object',
                                        properties: {
                                            payload: payloadSchema
                                        }
                                    };
                                    handleSchemaChange(JSON.stringify(fullSchema, null, 2));
                                } catch (e) {
                                    handleSchemaChange(value);
                                }
                            } else {
                                handleSchemaChange(value);
                            }
                        }}
                        isOptional={true}
                        showModeToggle={true}
                    />
                    <div className="mt-2 text-[10px] text-muted-foreground">
                        <HelpTooltip text="Input Schema is optional documentation/validation describing expected payload shape. The payload JSON is what runs; schema does not inject credentials nor drive payload. Leave disabled if not needed." />
                    </div>
                </TabsContent>
            </Tabs>
        </>
    );
};

export const PayloadMiniStepCard = React.memo(({
    payloadText,
    inputSchema,
    onChange,
    onInputSchemaChange,
    readOnly,
    onFilesUpload,
    uploadedFiles,
    onFileRemove,
    isProcessingFiles,
    totalFileSize,
    onUserEdit,
    isPayloadValid
}: {
    payloadText: string;
    inputSchema?: string | null;
    onChange?: (value: string) => void;
    onInputSchemaChange?: (value: string | null) => void;
    readOnly?: boolean;
    onFilesUpload?: (files: File[]) => Promise<void>;
    uploadedFiles?: UploadedFileInfo[];
    onFileRemove?: (key: string) => void;
    isProcessingFiles?: boolean;
    totalFileSize?: number;
    onUserEdit?: () => void;
    isPayloadValid?: boolean;
}) => {
    return (
        <Card className="w-full max-w-6xl mx-auto shadow-md border dark:border-border/50">
            <div className="p-3">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <FileJson className="h-4 w-4 text-muted-foreground" />
                        <h3 className="text-lg font-semibold">Tool Input</h3>
                    </div>
                    <HelpTooltip text="Payload is the JSON input to tool execution. Editing here does NOT save values to the tool; it only affects this session/run. Use Input Schema to optionally describe the expected structure for validation and tooling." />
                </div>
                <PayloadSpotlight
                    payloadText={payloadText}
                    inputSchema={inputSchema}
                    onChange={onChange}
                    onInputSchemaChange={onInputSchemaChange}
                    readOnly={readOnly}
                    onFilesUpload={onFilesUpload}
                    uploadedFiles={uploadedFiles}
                    onFileRemove={onFileRemove}
                    isProcessingFiles={isProcessingFiles}
                    totalFileSize={totalFileSize}
                    onUserEdit={onUserEdit}
                    isPayloadValid={isPayloadValid}
                />
            </div>
        </Card>
    );
});


import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { Switch } from "@/src/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { cn, MAX_DISPLAY_LINES, MAX_DISPLAY_SIZE } from "@/src/lib/general-utils";
import Editor from '@monaco-editor/react';
import { Check, Copy, Plus, Trash2 } from "lucide-react";
import React from 'react';
import { useMonacoTheme } from "../../hooks/useMonacoTheme";

interface JsonSchemaEditorProps {
  value: string | null;
  onChange: (value: string | null) => void;
  isOptional?: boolean;
  title?: string;
  readOnly?: boolean;
  onBlur?: () => void;
  forceCodeMode?: boolean;
  showModeToggle?: boolean;
  errorPrefix?: string;
}

const SCHEMA_TYPES = ['object', 'string', 'number', 'boolean', 'integer', 'any', 'string[]', 'number[]', 'boolean[]', 'integer[]', 'object[]', 'any[]'];
const SCHEMA_TYPE_DISPLAY = {
  'object': 'object',
  'string': 'string',
  'number': 'number',
  'boolean': 'bool',
  'integer': 'integer',
  'any': 'any',
  'string[]': 'string[]',
  'number[]': 'number[]',
  'boolean[]': 'bool[]',
  'integer[]': 'integer[]',
  'object[]': 'object[]',
  'any[]': 'any[]',
};

const ARRAY_ITEM_TYPES = ['object', 'string', 'number', 'boolean', 'integer', 'any'];
const ARRAY_ITEM_TYPE_DISPLAY = {
  'object': 'object[]',
  'string': 'string[]',
  'number': 'number[]',
  'boolean': 'bool[]',
  'integer': 'integer[]',
  'any': 'any[]',
};

const JsonSchemaEditor: React.FC<JsonSchemaEditorProps> = ({
  value,
  onChange,
  isOptional = false,
  readOnly = false,
  onBlur,
  forceCodeMode = false,
  showModeToggle = true,
  errorPrefix,
}) => {
  const { theme, onMount } = useMonacoTheme();
  const [isCodeMode, setIsCodeMode] = React.useState(forceCodeMode || false);
  const [jsonError, setJsonError] = React.useState<string | null>(null);
  const [localIsEnabled, setLocalIsEnabled] = React.useState<boolean>(() => {
    if (!isOptional) {
      return true;
    }
    return value !== null && value !== '' && value !== undefined && value !== '{}' && value !== '{"type":"object","properties":{}}';
  });

  React.useEffect(() => {
    if (forceCodeMode) {
      setIsCodeMode(true);
      return;
    }
    const savedMode = localStorage?.getItem('jsonSchemaEditorCodeMode');
    if (savedMode !== null) {
      setIsCodeMode(savedMode === 'true');
    }
  }, [forceCodeMode]);

  React.useEffect(() => {
    if (forceCodeMode) return;
    if (typeof window !== 'undefined') {
      localStorage.setItem('jsonSchemaEditorCodeMode', isCodeMode.toString());
    }
  }, [isCodeMode, forceCodeMode]);

  React.useEffect(() => {
    if (isOptional && !localIsEnabled) {
      const shouldBeEnabled = value !== null && value !== '' && value !== undefined && value !== '{}' && value !== '{"type":"object","properties":{}}';
      if (shouldBeEnabled) {
        setLocalIsEnabled(true);
      }
    }
  }, [value, isOptional, localIsEnabled]);

  const [visualSchema, setVisualSchema] = React.useState<any>({});
  const [editingField, setEditingField] = React.useState<string | null>(null);
  // Store field name during editing in case of duplicate keys
  const [tempFieldName, setTempFieldName] = React.useState<string>("");
  // Track if current field name is a duplicate/invalid
  const [isDuplicateField, setIsDuplicateField] = React.useState(false);
  // Track the path of the currently hovered description field
  const [hoveredDescField, setHoveredDescField] = React.useState<string | null>(null);
  // Ref to store timeout IDs for hover delay
  const hoverTimeoutRef = React.useRef<{ [key: string]: NodeJS.Timeout }>({});

  // Clear all hover timeouts when component unmounts
  React.useEffect(() => {
    return () => {
      for (const timeoutId of Object.values(hoverTimeoutRef.current)) {
        clearTimeout(timeoutId);
      }
    };
  }, []);

  React.useEffect(() => {
    if (value === null) {
      setVisualSchema({});
      setJsonError(null);
      return;
    }
    if (value === '') {
      setVisualSchema({});
      setJsonError(null);
      return;
    }
    try {
      const val = typeof value === 'string' ? value : String(value);
      const parsed = JSON.parse(val);
      setVisualSchema(parsed);
      setJsonError(null);
    } catch (e) {
      setJsonError((e as Error).message);
    }
  }, [value]);

  const updateVisualSchema = (path: string[], newValue: any) => {
    const newSchema = { ...visualSchema };
    let current = newSchema;

    // Navigate to the target location
    for (let i = 0; i < path.length - 1; i++) {
      current = current[path[i]];
    }

    const lastKey = path[path.length - 1];
    const oldValue = current[lastKey];

    // If updating type field, remove properties/items
    if (lastKey === 'type' && oldValue !== newValue) {
      if (current.properties) {
        current.properties = {};
      }
      if (current.items) {
        current.items = {};
      }
    }

    current[lastKey] = newValue;
    setVisualSchema(newSchema);
    onChange(JSON.stringify(newSchema, null, 2));
  };

  // Handle mouse enter with delay
  const handleMouseEnter = (fieldId: string) => {
    // Clear any existing timeout for this field
    if (hoverTimeoutRef.current[fieldId]) {
      clearTimeout(hoverTimeoutRef.current[fieldId]);
    }

    // Set a new timeout to show tooltip after 2 seconds
    hoverTimeoutRef.current[fieldId] = setTimeout(() => {
      setHoveredDescField(fieldId);
    }, 1000);
  };

  // Handle mouse leave
  const handleMouseLeave = (fieldId: string) => {
    // Clear the timeout if mouse leaves before delay completes
    if (hoverTimeoutRef.current[fieldId]) {
      clearTimeout(hoverTimeoutRef.current[fieldId]);
      delete hoverTimeoutRef.current[fieldId];
    }

    // Hide the tooltip if it's currently shown for this field
    if (hoveredDescField === fieldId) {
      setHoveredDescField(null);
    }
  };

  const generateUniqueFieldName = (properties: any) => {
    let index = 1;
    let fieldName = 'newField';
    while (properties && properties[fieldName]) {
      fieldName = `newField${index}`;
      index++;
    }
    return fieldName;
  };

  const renderSchemaField = (fieldName: string, schema: any, path: string[] = [], isArrayChild = false) => {
    if (!schema) return null;

    const isRoot = path.length === 0;
    const isEditing = editingField === path.join('.');
    // Create a unique ID for this field's description
    const descFieldId = [...path, 'description'].join('.');

    // Helper function to check if field is required
    const isFieldRequired = () => {
      if (isRoot || isArrayChild) return false;
      const parentPath = path.slice(0, -2);
      let parent = visualSchema;
      for (const segment of parentPath) {
        parent = parent[segment];
      }
      return parent.required?.includes(fieldName) || false;
    };

    const finishEditing = () => {
      // Only update the schema if the field name is not a duplicate and not empty
      if (!isDuplicateField && tempFieldName !== fieldName && tempFieldName.trim() !== '') {
        const newSchema = { ...visualSchema };
        let current = newSchema;
        for (let i = 0; i < path.length - 2; i++) {
          current = current[path[i]];
        }

        const properties = current[path[path.length - 2]];
        const newProperties: Record<string, any> = {};

        // Apply the name change
        for (const key of Object.keys(properties)) {
          if (key === fieldName) {
            newProperties[tempFieldName] = properties[fieldName];
          } else {
            newProperties[key] = properties[key];
          }
        }

        // Update required fields if needed
        if (current.required?.includes(fieldName)) {
          current.required = current.required.map((f: string) =>
            f === fieldName ? tempFieldName : f
          );
        }

        current[path[path.length - 2]] = newProperties;
        setVisualSchema(newSchema);
        onChange(JSON.stringify(newSchema, null, 2));
      }

      // Always reset states when done editing
      setTempFieldName('');
      setEditingField(null);
      setIsDuplicateField(false);
    };

    return (
      <div key={fieldName} className="space-y-1 pl-2 border-l-2 border-gray-400 mb-2">
        <div className="flex items-center gap-2">
          {isEditing && !isArrayChild ? (
            <Input
              // Use the temporary state for the input value without updating schema
              value={tempFieldName}
              onChange={(e) => {
                // Just update the temporary field name for visual display
                // WITHOUT modifying the actual schema until editing is complete
                setTempFieldName(e.target.value);

                let current = visualSchema;
                for (let i = 0; i < path.length - 2; i++) {
                  current = current[path[i]];
                }
                const properties = current[path[path.length - 2]];

                // it's a duplicate if a property with that name exists and it's not the current field
                const isDuplicateKey = properties[e.target.value] && fieldName !== e.target.value;
                setIsDuplicateField(isDuplicateKey);  // for UI highlighting
                // DO NOT update the schema while typing - only when editing is complete
              }}
              className={cn(
                "w-36 min-h-[32px] text-xs sm:text-sm",
                isDuplicateField && "border-red-500 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400"
              )}
              placeholder="Field name"
              autoFocus
              onBlur={finishEditing}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  finishEditing();
                }
              }}
            />
          ) : (!isArrayChild && !isRoot && (
            <div
              className={cn(
                "w-36 px-2 py-0.5 min-h-[32px] rounded hover:bg-secondary cursor-pointer flex items-center gap-0.5",
                "text-[11px] xs:text-[12px] sm:text-[14px] truncate"
              )}
              title={fieldName}
              onClick={() => {
                // Initialize the temp field name with the current field name
                setTempFieldName(fieldName);
                setEditingField(path.join('.'));
                // Reset duplicate field indicator when starting to edit
                setIsDuplicateField(false);
              }}
            >
              {isRoot ? 'root' : fieldName}
              {isFieldRequired() && (
                <span className="text-red-500 text-[14px] sm:text-[18px] font-bold" title="Required field">*</span>
              )}
            </div>
          ))}
          {isRoot && (
            <div
              className={cn(
                "w-36 px-2 py-0.5 min-h-[32px] rounded flex items-center gap-0.5",
                "text-[11px] xs:text-[12px] sm:text-[14px] text-muted-foreground"
              )}
            >
              root
            </div>
          )}
          <Select
            value={
              isArrayChild
                ? (typeof schema.type === 'string' ? schema.type : 'any')
                : schema.type === 'array' && schema.items?.type
                  ? `${schema.items.type}[]`
                  : (typeof schema.type === 'string' ? schema.type : 'any')
            }
            onValueChange={(value) => {
              if (isArrayChild) {
                updateVisualSchema([...path, 'type'], value);
              } else if (value.endsWith('[]')) {
                // Handle array types like 'string[]'
                const itemType = value.slice(0, -2);
                if (isRoot) {
                  // Handle root array type specially
                  const newSchema = {
                    type: 'array',
                    items: { type: itemType }
                  };
                  setVisualSchema(newSchema);
                  onChange(JSON.stringify(newSchema, null, 2));
                } else {
                  const newSchema = { ...visualSchema };
                  let current = newSchema;
                  for (let i = 0; i < path.length - 1; i++) {
                    current = current[path[i]];
                  }
                  current[path[path.length - 1]] = {
                    type: 'array',
                    items: { type: itemType }
                  };
                  setVisualSchema(newSchema);
                  onChange(JSON.stringify(newSchema, null, 2));
                }
              } else {
                updateVisualSchema([...path, 'type'], value);
              }
            }}
          >
            <SelectTrigger className="w-28 h-8 text-xs sm:text-sm">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent className="text-xs sm:text-sm">
              {(isArrayChild ? ARRAY_ITEM_TYPES : SCHEMA_TYPES).map(type => (
                <SelectItem key={type} value={type}>
                  {isArrayChild ? ARRAY_ITEM_TYPE_DISPLAY[type] : SCHEMA_TYPE_DISPLAY[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <TooltipProvider>
            <Tooltip open={hoveredDescField === descFieldId}>
              <TooltipTrigger asChild>
                <Input
                  value={schema.description || ''}
                  onChange={(e) => {
                    updateVisualSchema([...path, 'description'], e.target.value);
                    // Clear any pending timeout
                    if (hoverTimeoutRef.current[descFieldId]) {
                      clearTimeout(hoverTimeoutRef.current[descFieldId]);
                      delete hoverTimeoutRef.current[descFieldId];
                    }
                    // Hide tooltip when typing
                    setHoveredDescField(null);
                  }}
                  className="w-full min-w-[200px] flex-1 border-muted hover:border-primary/50 focus:border-primary/50 text-xs sm:text-sm"
                  placeholder="Add AI instructions or filters"
                  onFocus={() => {
                    // Clear timeout and hide tooltip on focus
                    if (hoverTimeoutRef.current[descFieldId]) {
                      clearTimeout(hoverTimeoutRef.current[descFieldId]);
                      delete hoverTimeoutRef.current[descFieldId];
                    }
                    setHoveredDescField(null);
                  }}
                  onMouseEnter={() => handleMouseEnter(descFieldId)}
                  onMouseLeave={() => handleMouseLeave(descFieldId)}
                />
              </TooltipTrigger>
              <TooltipContent side="top">
                <span className="text-xs sm:text-sm">Add instructions to help AI understand how to map data to this field</span>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {!isRoot && !isArrayChild && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="relative z-10">
                    <Switch
                      className="custom-switch"
                      id={`required-${path.join('-')}`}
                      checked={isFieldRequired()}
                      onCheckedChange={(checked) => {
                        const parentPath = path.slice(0, -2);
                        const newSchema = { ...visualSchema };
                        let parent = newSchema;
                        for (const segment of parentPath) {
                          parent = parent[segment];
                        }

                        if (checked) {
                          parent.required = [...(parent.required || []), fieldName];
                        } else {
                          parent.required = (parent.required || []).filter((f: string) => f !== fieldName);
                          if (parent.required.length === 0) {
                            delete parent.required;
                          }
                        }

                        setVisualSchema(newSchema);
                        onChange(JSON.stringify(newSchema, null, 2));
                      }}
                    />
                    <span className="pointer-events-none absolute flex h-4 w-4 items-center justify-center rounded-full bg-white shadow-lg ring-0 transition-transform peer-data-[state=checked]:translate-x-4 peer-data-[state=unchecked]:translate-x-0 left-[2px] top-[2px]">
                      {isFieldRequired() ? (
                        <span className="text-red-500 text-[12px] sm:text-[16px] font-bold leading-none mt-2">*</span>
                      ) : (
                        <span className="text-muted-foreground text-[10px] sm:text-[12px] font-semibold leading-none">?</span>
                      )}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="z-50 text-xs sm:text-sm">
                  {isFieldRequired() ? 'Make field optional' : 'Make field required'}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {!isRoot && path.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive h-8 w-8 min-w-[2rem] min-h-[2rem]"
              onClick={() => {
                const newSchema = { ...visualSchema };
                let current = newSchema;

                // Navigate to the parent to handle required fields
                const parentPath = path.slice(0, -2);
                let parent = newSchema;
                for (const segment of parentPath) {
                  parent = parent[segment];
                }

                // If this field was required, remove it from the required array
                if (parent.required?.includes(fieldName)) {
                  parent.required = parent.required.filter((f: string) => f !== fieldName);
                  // Remove the required array if it's empty
                  if (parent.required.length === 0) {
                    delete parent.required;
                  }
                }

                // Delete the field itself
                for (let i = 0; i < path.length - 1; i++) current = current[path[i]];
                delete current[path[path.length - 1] === 'properties' ? fieldName : path[path.length - 1]];

                setVisualSchema(newSchema);
                onChange(JSON.stringify(newSchema, null, 2));
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>

        {schema.type === 'object' && (
          <div className={`pl-2 ${!isRoot && 'mt-1'}`}>
            <div className="overflow-x-auto">
              {schema.properties && Object.entries(schema.properties).map(([key, value]) =>
                renderSchemaField(key, value, [...path, 'properties', key])
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2 text-xs sm:text-sm"
              onClick={() => updateVisualSchema(
                [...path, 'properties'],
                {
                  ...(schema.properties || {}),
                  [generateUniqueFieldName(schema.properties)]: { type: 'string' }
                }
              )}
            >
              <Plus className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="text-xs sm:text-sm">Add Property</span>
            </Button>
          </div>
        )}

        {schema.type === 'array' && schema.items?.type === 'object' && (
          <div className="pl-2 mt-1">
            <div className="overflow-x-auto">
              {schema.items.properties && Object.entries(schema.items.properties).map(([key, value]) =>
                renderSchemaField(key, value, [...path, 'items', 'properties', key])
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2 text-xs sm:text-sm"
              onClick={() => updateVisualSchema(
                [...path, 'items', 'properties'],
                {
                  ...(schema.items.properties || {}),
                  [generateUniqueFieldName(schema.items.properties)]: { type: 'string' }
                }
              )}
            >
              <Plus className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="text-xs sm:text-sm">Add Property</span>
            </Button>
          </div>
        )}

      </div>
    );
  };

  const ensureObjectStructure = (schema: any) => {
    if (!schema.type) schema.type = 'any';
    if (!schema.properties) schema.properties = {};
    return schema;
  };


  const handleEnabledChange = (enabled: boolean) => {
    if (isOptional) {
      setLocalIsEnabled(enabled);
      if (!enabled) {
        onChange(null);
      } else {
        // If enabling and current parent value is null or empty, provide a default
        // This ensures a fresh start if re-enabled
        if (value === null || value === '') {
          onChange(JSON.stringify(ensureObjectStructure({ type: 'any' }), null, 2));
        }
        // Otherwise keep the existing value
      }
    }
  };

  const shouldShowHeader = (showModeToggle && (localIsEnabled || !isOptional)) || isOptional;

  return (
    <div className="space-y-1 flex flex-col h-full min-h-[300px] mb-4 gap-2">
      {shouldShowHeader && (
        <div className="flex items-center gap-4 ml-auto shrink-0">
          <div className="flex items-center gap-4">
            {showModeToggle && (localIsEnabled || !isOptional) && (
              <div className="flex items-center gap-2">
                <Label htmlFor="editorMode" className="text-xs">Code Mode</Label>
                <Switch className="custom-switch" id="editorMode" checked={isCodeMode} onCheckedChange={setIsCodeMode} />
              </div>
            )}
            {isOptional && (
              <div className="flex items-center gap-2">
                <Label htmlFor="schemaOptionalToggle" className="text-xs">Enabled</Label>
                <Switch
                  className="custom-switch"
                  id="schemaOptionalToggle"
                  checked={localIsEnabled}
                  onCheckedChange={handleEnabledChange}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {isCodeMode && jsonError && (
          
        <div className="p-2 bg-destructive/10 border border-destructive/20 text-destructive text-xs rounded-md">
        {errorPrefix && (
            <div >
              {errorPrefix}
            </div>
          )}
          Error: {jsonError}
        </div>
      )}
      {isCodeMode && readOnly && value && (value.length > MAX_DISPLAY_SIZE || (value.split('\n').length > MAX_DISPLAY_LINES)) && (
        <div className="p-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs rounded-md text-amber-800 dark:text-amber-200">
          Preview may be truncated for performance
        </div>
      )}

      {localIsEnabled ? (
        <div className="flex-1 border rounded-md">
          {isCodeMode ? (
            <div className="h-full font-mono relative bg-transparent px-3">
              <div className="absolute top-1 right-1 z-10">
                <IconCopyButton text={value ?? ''} />
              </div>
              <Editor
                height="300px"
                defaultLanguage="json"
                value={value ?? ''}
                onChange={(code) => {
                  try {
                    if (code === '' || code === null) {
                      setJsonError(null);
                      onChange(code || '');
                    } else {
                      JSON.parse(code);
                      setJsonError(null);
                      onChange(code || '');
                    }
                  } catch (e) {
                    setJsonError((e as Error).message);
                  }
                }}
                onMount={onMount}
                options={{
                  readOnly,
                  minimap: { enabled: false },
                  fontSize: 12,
                  lineNumbers: 'off',
                  glyphMargin: false,
                  folding: false,
                  lineDecorationsWidth: 0,
                  lineNumbersMinChars: 0,
                  scrollBeyondLastLine: false,
                  wordWrap: 'on',
                  contextmenu: false,
                  renderLineHighlight: 'none',
                  scrollbar: {
                    vertical: 'auto',
                    horizontal: 'auto',
                    verticalScrollbarSize: 8,
                    horizontalScrollbarSize: 8,
                    alwaysConsumeMouseWheel: false
                  },
                  overviewRulerLanes: 0,
                  padding: { top: 12, bottom: 12 },
                  tabSize: 2,
                  quickSuggestions: false,
                  parameterHints: { enabled: false },
                  codeLens: false,
                  links: false,
                  colorDecorators: false,
                  occurrencesHighlight: 'off',
                  renderValidationDecorations: 'off'
                }}
                theme={theme}
                className="bg-transparent"
              />
            </div>
          ) : (
            <div className="h-full flex flex-col min-h-0">
              {Object.keys(visualSchema).length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <p className="mb-4 text-xs sm:text-sm mt-6">No schema defined yet</p>
                  <Button
                    variant="outline"
                    className="text-xs sm:text-sm"
                    onClick={() => {
                      const initialSchema = ensureObjectStructure({ type: 'any' });
                      setVisualSchema(initialSchema);
                      onChange(JSON.stringify(initialSchema, null, 2));
                    }}
                  >
                    <span className="text-xs sm:text-sm">Add Root Property</span>
                  </Button>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto min-h-0">
                  <div className="p-4">
                    <div className="overflow-x-auto">
                      {renderSchemaField('root', visualSchema, [])}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="flex-grow min-h-[4rem] p-3 border rounded-md text-sm text-muted-foreground bg-muted/50 flex items-center justify-center">
          Schema definition is disabled.
        </div>
      )}
    </div>
  );
};

export default JsonSchemaEditor;

const IconCopyButton = ({ text }: { text: string }) => {
  const [copied, setCopied] = React.useState(false);
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    navigator.clipboard.writeText(text || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      onClick={handleCopy}
      className="h-6 w-6 flex items-center justify-center rounded hover:bg-background/80 transition-colors bg-background/60 backdrop-blur"
      title="Copy"
      type="button"
    >
      {copied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
    </button>
  );
};

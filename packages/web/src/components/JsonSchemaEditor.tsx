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
import { Textarea } from "@/src/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { cn } from "@/src/lib/utils";
import { ListPlus, Plus, Trash2 } from "lucide-react";
import React from 'react';

interface JsonSchemaEditorProps {
  value: string;
  onChange: (value: string) => void;
}

const SCHEMA_TYPES = ['object', 'array', 'string', 'number', 'boolean', 'integer'];
const SCHEMA_TYPE_DISPLAY = {
  'object': 'object',
  'array': 'array',
  'string': 'string',
  'number': 'number',
  'boolean': 'bool',
  'integer': 'integer',
};

const JsonSchemaEditor: React.FC<JsonSchemaEditorProps> = ({ value, onChange }) => {
  const [isCodeMode, setIsCodeMode] = React.useState(() => {
    // Initialize from localStorage, default to false if not set
    return localStorage.getItem('jsonSchemaEditorCodeMode') === 'true'
  });
  
  // Update localStorage when isCodeMode changes
  React.useEffect(() => {
    localStorage.setItem('jsonSchemaEditorCodeMode', isCodeMode.toString());
  }, [isCodeMode]);
  
  const [visualSchema, setVisualSchema] = React.useState<any>({});
  const [editingField, setEditingField] = React.useState<string | null>(null);
  // Track the path of the currently hovered description field
  const [hoveredDescField, setHoveredDescField] = React.useState<string | null>(null);
  // Ref to store timeout IDs for hover delay
  const hoverTimeoutRef = React.useRef<{ [key: string]: NodeJS.Timeout }>({});
  
  // Clear all hover timeouts when component unmounts
  React.useEffect(() => {
    return () => {
      Object.values(hoverTimeoutRef.current).forEach(timeoutId => {
        clearTimeout(timeoutId);
      });
    };
  }, []);
  
  React.useEffect(() => {
    try {
      setVisualSchema(JSON.parse(value));
    } catch (e) {
      value !== '' && console.error('Invalid JSON Schema:', e);
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
        delete current.properties;
      }
      if (current.items) {
        delete current.items;
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

  const renderSchemaField = (fieldName: string, schema: any, path: string[] = [], isArrayChild: boolean = false) => {
    if (!schema) return null;

    const isRoot = path.length === 0;
    const isEditing = editingField === path.join('.');
    // Create a unique ID for this field's description
    const descFieldId = [...path, 'description'].join('.');
    
    // Add this helper function to check if field is required
    const isFieldRequired = () => {
      if (isRoot || isArrayChild) return false;
      const parentPath = path.slice(0, -2);
      let parent = visualSchema;
      for (const segment of parentPath) {
        parent = parent[segment];
      }
      return parent.required?.includes(fieldName) || false;
    };

    return (
      <div key={fieldName} className="space-y-1 pl-2 border-l-2 border-gray-400 mb-2">
        {!isRoot && (
          <div className="flex items-center gap-2">
            {isEditing && !isArrayChild ? (
              <Input
                value={fieldName}
                onChange={(e) => {
                  const newSchema = { ...visualSchema };
                  let current = newSchema;
                  for (let i = 0; i < path.length - 2; i++) {
                    current = current[path[i]];
                  }
                  const properties = current[path[path.length - 2]];
                  const newPath = [...path.slice(0, -1), e.target.value].join('.');

                  // Update the required array if this field is required
                  if (current.required?.includes(fieldName)) {
                    current.required = current.required.map((f: string) => 
                      f === fieldName ? e.target.value : f
                    );
                  }

                  const newProperties: Record<string, any> = {};
                  Object.keys(properties).forEach(key => {
                    if (key === fieldName) {
                      newProperties[e.target.value] = properties[fieldName];
                    } else {
                      newProperties[key] = properties[key];
                    }
                  });
                  
                  current[path[path.length - 2]] = newProperties;
                  setVisualSchema(newSchema);
                  onChange(JSON.stringify(newSchema, null, 2));
                  setEditingField(newPath);
                }}
                className="w-36 min-h-[32px] text-xs sm:text-sm"
                placeholder="Field name"
                autoFocus
                onBlur={() => setEditingField(null)}
                onKeyDown={(e) => e.key === 'Enter' && setEditingField(null)}
              />
            ) : (!isArrayChild &&(
              <div 
                className={cn(
                  "w-36 px-2 py-0.5 min-h-[32px] rounded hover:bg-secondary cursor-pointer flex items-center gap-0.5",
                  "text-[11px] xs:text-[12px] sm:text-[14px]"
                )}
                onClick={() => setEditingField(path.join('.'))}
              >
                {fieldName}
                {isFieldRequired() && (
                  <span className="text-red-500 text-[14px] sm:text-[18px] font-bold" title="Required field">*</span>
                )}
              </div>
            ))}
            <Select
              value={typeof schema.type === 'string' ? schema.type : 'string'}
              onValueChange={(value) => updateVisualSchema([...path, 'type'], value)}
            >
              <SelectTrigger className="w-24 h-8 text-xs sm:text-sm">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent className="text-xs sm:text-sm">
                {SCHEMA_TYPES.map(type => (
                  <SelectItem key={type} value={type}>{SCHEMA_TYPE_DISPLAY[type]}</SelectItem>
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
                    className="w-full min-w-[200px] max-w-[400px] flex-1 border-muted hover:border-primary/50 focus:border-primary text-xs sm:text-sm"
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
                        className="peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
                      />
                      <span className="pointer-events-none absolute flex h-4 w-4 items-center justify-center rounded-full bg-background shadow-lg ring-0 transition-transform peer-data-[state=checked]:translate-x-4 peer-data-[state=unchecked]:translate-x-0 left-[2px] top-[2px]">
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
            {path.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
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
        )}

        {schema.type === 'object' && (
          <div className={`pl-2 ${!isRoot && 'mt-1'}`}>
            {schema.properties && Object.entries(schema.properties).map(([key, value]) =>
              renderSchemaField(key, value, [...path, 'properties', key])
            )}
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

        {schema.type === 'array' && (
          <div className="pl-2 mt-1">
            {schema.items && renderSchemaField('items', schema.items, [...path, 'items'], true)}
            {!schema.items && (
            <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-2 text-xs sm:text-sm"
        onClick={() => updateVisualSchema(
        [...path, 'items'],
        { 
            type: 'string',
            ...(schema.items || {}),
        }
        )}
    >
            <ListPlus className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="text-xs sm:text-sm">Set Item</span>
            </Button>        
            )}
          </div>
        )}
      </div>
    );
  };

  const ensureObjectStructure = (schema: any) => {
    if (!schema.type) schema.type = 'object';
    if (!schema.properties) schema.properties = {};
    return schema;
  };

  return (
    <div className="space-y-1 flex flex-col h-full mb-4">
      <div className="flex justify-between items-center shrink-0">
        <Label htmlFor="responseSchema" className="text-xs sm:text-sm">Set your desired response schema</Label>
        <div className="flex items-center gap-2">
          <Label htmlFor="editorMode" className="text-xs sm:text-sm">Code Mode</Label>
          <Switch id="editorMode" checked={isCodeMode} onCheckedChange={setIsCodeMode} />
        </div>
      </div>

      <div className="flex-1 min-h-0 border rounded-md overflow-hidden">
        {isCodeMode ? (
          <Textarea
            id="responseSchema"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="{}"
            className="font-mono border-0 h-full text-xs sm:text-sm"
          />
        ) : (
          <div className="h-full flex flex-col min-h-0">
            {Object.keys(visualSchema).length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <p className="mb-4 text-xs sm:text-sm">No schema defined yet</p>
                <Button
                  variant="outline"
                  className="text-xs sm:text-sm"
                  onClick={() => {
                    const initialSchema = ensureObjectStructure({ type: 'object', properties: {} });
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
                  {renderSchemaField('root', visualSchema, [])}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default JsonSchemaEditor; 
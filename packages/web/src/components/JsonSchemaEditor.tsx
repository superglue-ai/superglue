import React from 'react';
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Textarea } from "@/src/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { Switch } from "@/src/components/ui/switch";
import { Plus, Trash2, ChevronRight, ListPlus } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";

interface JsonSchemaEditorProps {
  value: string;
  onChange: (value: string) => void;
}

const SCHEMA_TYPES = ['object', 'array', 'string', 'number', 'boolean', 'null'];

const JsonSchemaEditor: React.FC<JsonSchemaEditorProps> = ({ value, onChange }) => {
  const [isCodeMode, setIsCodeMode] = React.useState(true);
  const [visualSchema, setVisualSchema] = React.useState<any>({});
  const [editingField, setEditingField] = React.useState<string | null>(null);

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
                className="w-48 min-h-[32px]"
                placeholder="Field name"
                autoFocus
                onBlur={() => setEditingField(null)}
                onKeyDown={(e) => e.key === 'Enter' && setEditingField(null)}
              />
            ) : (!isArrayChild &&(
              <div 
                className={`w-48 px-2 py-0.5 min-h-[32px] rounded hover:bg-secondary cursor-pointer text-[14px] flex items-center gap-0.5`}
                onClick={() => setEditingField(path.join('.'))}
              >
                {fieldName}
                {isFieldRequired() && (
                  <span className="text-red-500 text-[18px] font-bold" title="Required field">*</span>
                )}
              </div>
            ))}
            <Select
              value={schema.type}
              onValueChange={(value) => updateVisualSchema([...path, 'type'], value)}
            >
              <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SCHEMA_TYPES.map(type => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              value={schema.description || ''}
              onChange={(e) => updateVisualSchema([...path, 'description'], e.target.value)}
              className="flex-1"
              placeholder="Description"
            />
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
                          <span className="text-red-500 text-[16px] font-bold leading-none mt-2">*</span>
                        ) : (
                          <span className="text-muted-foreground text-[12px] font-semibold leading-none">?</span>
                        )}
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="z-50">
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
              className="gap-2"
              onClick={() => updateVisualSchema(
                [...path, 'properties'],
                { 
                  ...(schema.properties || {}), 
                  [generateUniqueFieldName(schema.properties)]: { type: 'string' } 
                }
              )}
            >
              <Plus className="h-4 w-4" />
              Add Property
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
        className="gap-2"
        onClick={() => updateVisualSchema(
        [...path, 'items'],
        { 
            type: 'string',
            ...(schema.items || {}),
        }
        )}
    >
            <ListPlus className="h-4 w-4" />
                Set Item
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
    <div className="space-y-1 h-full flex-1 flex flex-col mb-4 h-full">
      <div className="flex justify-between items-center">
        <Label htmlFor="responseSchema">Set your desired response schema</Label>
        <div className="flex items-center gap-2">
          <Label htmlFor="editorMode" className="text-sm">Code Mode</Label>
          <Switch id="editorMode" checked={isCodeMode} onCheckedChange={setIsCodeMode} />
        </div>
      </div>

      <div className="flex-1 border rounded-md relative">
        {isCodeMode ? (
          <Textarea
            id="responseSchema"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="{}"
            className="font-mono border-0 h-full"
          />
        ) : (
          <div className="p-4 h-full">
            {Object.keys(visualSchema).length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <p className="mb-4">No schema defined yet</p>
                <Button
                  variant="outline"
                  onClick={() => {
                    const initialSchema = ensureObjectStructure({ type: 'object', properties: {} });
                    setVisualSchema(initialSchema);
                    onChange(JSON.stringify(initialSchema, null, 2));
                  }}
                >
                  Add Root Property
                </Button>
              </div>
            ) : (
              <div className="h-full pr-2">
                {renderSchemaField('root', visualSchema, [])}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default JsonSchemaEditor; 
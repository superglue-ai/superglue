import { Extension } from '@tiptap/core';
import { ReactRenderer } from '@tiptap/react';
import Suggestion, { SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion';
import tippy, { Instance as TippyInstance } from 'tippy.js';
import { forwardRef, useImperativeHandle, useState, useRef, useEffect } from 'react';
import { cn } from '@/src/lib/general-utils';
import { Key, FileInput, FileJson, Route, Code2, ChevronRight, Paperclip } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTheme } from '@/src/hooks/useTheme';
import { type CategorizedVariables, type CategorizedSources } from './TemplateContext';

const TYPE_COLORS = {
    light: { string: '#50A14F', number: '#0184BC', object: '#0997B3', array: '#C678DD', other: '#383A42' },
    dark: { string: '#98C379', number: '#61AFEF', object: '#56B6C2', array: '#C678DD', other: '#ABB2BF' }
};

type ValueType = 'object' | 'array' | 'string' | 'number' | 'other';

function getValueType(value: unknown): ValueType {
    if (Array.isArray(value)) return 'array';
    if (value !== null && typeof value === 'object') return 'object';
    if (typeof value === 'string') return 'string';
    if (typeof value === 'number') return 'number';
    return 'other';
}

function getTypeSymbol(type: ValueType): string {
    switch (type) {
        case 'object': return '{}';
        case 'array': return '[]';
        case 'string': return '""';
        case 'number': return '123';
        default: return '';
    }
}

function getTypeColor(type: ValueType, isDarkMode: boolean): string {
    const colors = isDarkMode ? TYPE_COLORS.dark : TYPE_COLORS.light;
    return colors[type];
}

interface CategoryConfig {
    key: keyof CategorizedVariables;
    label: string;
    icon: ReactNode;
}

const CATEGORY_CONFIGS: CategoryConfig[] = [
    { key: 'credentials', label: 'Credentials', icon: <Key className="h-4 w-4" /> },
    { key: 'toolInputs', label: 'Tool Inputs', icon: <FileJson className="h-4 w-4" /> },
    { key: 'fileInputs', label: 'File Inputs', icon: <Paperclip className="h-4 w-4" /> },
    { key: 'currentStepData', label: 'Current Step Data', icon: <FileInput className="h-4 w-4" /> },
    { key: 'previousStepData', label: 'Previous Step Data', icon: <Route className="h-4 w-4" /> },
];

interface VariableCommandMenuProps {
    categorizedVariables: CategorizedVariables;
    categorizedSources?: CategorizedSources;
    onSelectVariable: (varName: string, categoryKey: keyof CategorizedVariables) => void;
    onSelectCode: (anchorRect: DOMRect | null) => void;
    onRequestClose: () => void;
}

interface VariableCommandMenuRef {
    onKeyDown: (event: KeyboardEvent) => boolean;
}

const MENU_WIDTH = 220;
const MAX_LIST_HEIGHT = 220;

function getValueFromSources(
    varName: string, 
    categoryKey: keyof CategorizedVariables, 
    sources?: CategorizedSources
): unknown {
    if (!sources) return undefined;
    switch (categoryKey) {
        case 'credentials': return undefined;
        case 'toolInputs': return sources.manualPayload?.[varName];
        case 'fileInputs': return sources.filePayloads?.[varName];
        case 'currentStepData': return varName === 'currentItem' ? sources.currentItem : undefined;
        case 'previousStepData': return sources.previousStepResults?.[varName];
        default: return undefined;
    }
}

function getNestedValue(obj: unknown, path: string[]): unknown {
    let current = obj;
    for (const key of path) {
        if (current === null || current === undefined || typeof current !== 'object') return undefined;
        current = (current as Record<string, unknown>)[key];
    }
    return current;
}

type NavigationState = 
    | { level: 'categories' }
    | { level: 'variables'; category: CategoryConfig }
    | { level: 'nested'; category: CategoryConfig; varName: string; path: string[] };

const VariableCommandMenu = forwardRef<VariableCommandMenuRef, VariableCommandMenuProps>(
    ({ categorizedVariables, categorizedSources, onSelectVariable, onSelectCode, onRequestClose }, ref) => {
        const [, , resolvedTheme] = useTheme();
        const isDarkMode = resolvedTheme === 'dark';
        const [navState, setNavState] = useState<NavigationState>({ level: 'categories' });
        const [selectedIndex, setSelectedIndex] = useState(0);
        const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

        const nonEmptyCategories = CATEGORY_CONFIGS.filter(
            (config) => categorizedVariables[config.key]?.length > 0
        );

        const getCurrentItems = (): { items: string[]; canDrill: boolean[]; types: ValueType[] } => {
            if (navState.level === 'categories') {
                return { 
                    items: nonEmptyCategories.map(c => c.key), 
                    canDrill: nonEmptyCategories.map(() => true),
                    types: nonEmptyCategories.map(() => 'other' as ValueType)
                };
            }
            if (navState.level === 'variables') {
                const vars = categorizedVariables[navState.category.key] || [];
                const isCredentialsCategory = navState.category.key === 'credentials';
                const canDrill = vars.map(varName => {
                    if (isCredentialsCategory) return false;
                    const value = getValueFromSources(varName, navState.category.key, categorizedSources);
                    return getValueType(value) === 'object';
                });
                const types = vars.map(varName => {
                    if (isCredentialsCategory) return 'string' as ValueType;
                    const value = getValueFromSources(varName, navState.category.key, categorizedSources);
                    return getValueType(value);
                });
                return { items: vars, canDrill, types };
            }
            if (navState.level === 'nested') {
                const baseValue = getValueFromSources(navState.varName, navState.category.key, categorizedSources);
                const nestedValue = navState.path.length > 0 ? getNestedValue(baseValue, navState.path) : baseValue;
                if (nestedValue && typeof nestedValue === 'object' && !Array.isArray(nestedValue)) {
                    const keys = Object.keys(nestedValue as Record<string, unknown>);
                    const canDrill = keys.map(key => {
                        const val = (nestedValue as Record<string, unknown>)[key];
                        return getValueType(val) === 'object' && navState.path.length < 1;
                    });
                    const types = keys.map(key => getValueType((nestedValue as Record<string, unknown>)[key]));
                    return { items: keys, canDrill, types };
                }
            }
            return { items: [], canDrill: [], types: [] };
        };

        const { items, canDrill, types } = getCurrentItems();

        useEffect(() => {
            setSelectedIndex(0);
        }, [navState]);

        useEffect(() => {
            itemRefs.current[selectedIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, [selectedIndex]);

        const handleBack = () => {
            if (navState.level === 'categories') {
                onRequestClose();
                return true;
            }
            if (navState.level === 'variables') {
                setNavState({ level: 'categories' });
                return true;
            }
            if (navState.level === 'nested') {
                if (navState.path.length > 0) {
                    setNavState({ ...navState, path: navState.path.slice(0, -1) });
                } else {
                    setNavState({ level: 'variables', category: navState.category });
                }
                return true;
            }
            return false;
        };

        const handleSelect = (index: number) => {
            if (navState.level === 'categories') {
                const category = nonEmptyCategories[index];
                if (category) {
                    setNavState({ level: 'variables', category });
                }
                return;
            }
            if (navState.level === 'variables') {
                const varName = items[index];
                if (canDrill[index]) {
                    setNavState({ level: 'nested', category: navState.category, varName, path: [] });
                } else {
                    onSelectVariable(varName, navState.category.key);
                }
                return;
            }
            if (navState.level === 'nested') {
                const propKey = items[index];
                const fullPath = [navState.varName, ...navState.path, propKey].join('.');
                if (canDrill[index]) {
                    setNavState({ ...navState, path: [...navState.path, propKey] });
                } else {
                    onSelectVariable(fullPath, navState.category.key);
                }
            }
        };

        useImperativeHandle(ref, () => ({
            onKeyDown: (event: KeyboardEvent) => {
                const totalItems = items.length + 1;
                
                if (event.key === 'ArrowUp') {
                    setSelectedIndex(prev => (prev - 1 + totalItems) % totalItems);
                    return true;
                }
                if (event.key === 'ArrowDown') {
                    setSelectedIndex(prev => (prev + 1) % totalItems);
                    return true;
                }
                if (event.key === 'Escape' || event.key === 'ArrowLeft') {
                    return handleBack();
                }
                if (event.key === 'Enter' || event.key === 'ArrowRight') {
                    if (selectedIndex === items.length) {
                        onSelectCode(null);
                        return true;
                    }
                    if (selectedIndex < items.length) {
                        handleSelect(selectedIndex);
                        return true;
                    }
                }
                return false;
            },
        }));

        const renderBreadcrumb = () => {
            if (navState.level === 'categories') return null;
            
            let label = navState.category.label;
            if (navState.level === 'nested') {
                label = `${navState.varName}${navState.path.length > 0 ? '.' + navState.path.join('.') : ''}`;
            }
            
            return (
                <div className="px-3 py-1.5 text-xs text-muted-foreground border-b truncate">
                    {label}
                </div>
            );
        };

        return (
            <div 
                className="bg-popover border rounded-lg shadow-lg overflow-hidden" 
                style={{ width: `${MENU_WIDTH}px` }}
            >
                {renderBreadcrumb()}
                <div className="overflow-y-auto" style={{ maxHeight: `${MAX_LIST_HEIGHT}px` }}>
                    {navState.level === 'categories' ? (
                        nonEmptyCategories.length === 0 ? (
                            <div className="px-3 py-2 text-xs text-muted-foreground">
                                No variables available
                            </div>
                        ) : (
                            nonEmptyCategories.map((config, index) => (
                                <button
                                    key={config.key}
                                    ref={(el) => { itemRefs.current[index] = el; }}
                                    onClick={() => handleSelect(index)}
                                    onMouseEnter={() => setSelectedIndex(index)}
                                    onMouseDown={(e) => e.preventDefault()}
                                    className={cn(
                                        "w-full flex items-center justify-between gap-2 px-3 py-1.5 text-sm text-left whitespace-nowrap",
                                        selectedIndex === index && "bg-accent"
                                    )}
                                >
                                    <span className="flex items-center gap-2 text-muted-foreground shrink-0">
                                        {config.icon}
                                        <span className="text-foreground">{config.label}</span>
                                    </span>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <span className="text-xs text-muted-foreground">
                                            {categorizedVariables[config.key].length}
                                        </span>
                                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                </button>
                            ))
                        )
                    ) : (
                        items.map((item, index) => {
                            const typeSymbol = getTypeSymbol(types[index]);
                            const typeColor = getTypeColor(types[index], isDarkMode);
                            return (
                                <button
                                    key={item}
                                    ref={(el) => { itemRefs.current[index] = el; }}
                                    onClick={() => handleSelect(index)}
                                    onMouseEnter={() => setSelectedIndex(index)}
                                    onMouseDown={(e) => e.preventDefault()}
                                    className={cn(
                                        "w-full flex items-center justify-between gap-2 px-3 py-1.5 text-sm text-left font-mono",
                                        selectedIndex === index && "bg-accent"
                                    )}
                                >
                                    <span className="flex items-center gap-1.5 truncate">
                                        {typeSymbol && (
                                            <span className="text-xs font-mono shrink-0" style={{ color: typeColor }}>
                                                {typeSymbol}
                                            </span>
                                        )}
                                        <span className="truncate">{item}</span>
                                    </span>
                                    {canDrill[index] && (
                                        <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                                    )}
                                </button>
                            );
                        })
                    )}
                </div>
                <div className="h-px bg-border" />
                <button
                    ref={(el) => { itemRefs.current[items.length] = el; }}
                    onClick={() => onSelectCode(null)}
                    onMouseEnter={() => setSelectedIndex(items.length)}
                    onMouseDown={(e) => e.preventDefault()}
                    className={cn(
                        "w-full flex items-center gap-2 px-3 py-1.5 text-sm whitespace-nowrap",
                        selectedIndex === items.length && "bg-accent"
                    )}
                >
                    <Code2 className="h-4 w-4 text-muted-foreground" />
                    Code expression
                </button>
            </div>
        );
    }
);

VariableCommandMenu.displayName = 'VariableCommandMenu';

interface SuggestionCallbacks {
    categorizedVariables: CategorizedVariables;
    categorizedSources?: CategorizedSources;
    onSelectVariable: (varName: string, range: { from: number; to: number }, categoryKey: keyof CategorizedVariables) => void;
    onSelectCode: (range: { from: number; to: number }, cursorCoords: { left: number; top: number } | null) => void;
    onEscape: (range: { from: number; to: number }) => void;
    onOpen?: (destroy: () => void) => void;
    onClose?: () => void;
}

export function createVariableSuggestionConfig(callbacks: SuggestionCallbacks) {
    return {
        char: '@',
        allowSpaces: false,
        startOfLine: false,
        allowedPrefixes: null,
        allow: ({ state, range }) => {
            // Must be right after @ with no text typed yet
            if (range.from + 1 < range.to) return false;
            // Must not have non-whitespace char immediately after cursor
            const charAfterCursor = state.doc.textBetween(range.to, range.to + 1, '\0', '\0');
            return charAfterCursor === '' || /\s/.test(charAfterCursor);
        },
        items: () => [],

        render: () => {
            let component: ReactRenderer<VariableCommandMenuRef> | null = null;
            let popup: TippyInstance[] | null = null;
            let currentRange: { from: number; to: number } | null = null;

            const destroyPopup = () => {
                popup?.[0]?.destroy();
                component?.destroy();
                currentRange = null;
            };

            return {
                onStart: (props: SuggestionProps<string>) => {
                    currentRange = props.range;

                    component = new ReactRenderer(VariableCommandMenu, {
                        props: {
                            categorizedVariables: callbacks.categorizedVariables,
                            categorizedSources: callbacks.categorizedSources,
                            onSelectVariable: (varName: string, categoryKey: keyof CategorizedVariables) => {
                                if (currentRange) callbacks.onSelectVariable(varName, currentRange, categoryKey);
                                popup?.[0]?.hide();
                            },
                            onSelectCode: (anchorRect: DOMRect | null) => {
                                if (currentRange) {
                                    const rect = anchorRect || props.clientRect?.();
                                    callbacks.onSelectCode(currentRange, rect ? { left: rect.left, top: rect.bottom } : null);
                                }
                                popup?.[0]?.hide();
                            },
                            onRequestClose: destroyPopup,
                        },
                        editor: props.editor,
                    });

                    if (!props.clientRect) return;

                    const rect = props.clientRect?.();
                    const wouldOverflowRight = rect && (rect.left + MENU_WIDTH > window.innerWidth - 16);
                    
                    popup = tippy('body', {
                        getReferenceClientRect: props.clientRect as () => DOMRect,
                        appendTo: () => document.body,
                        content: component.element,
                        showOnCreate: true,
                        interactive: true,
                        trigger: 'manual',
                        placement: wouldOverflowRight ? 'bottom-end' : 'bottom-start',
                        offset: [0, 4],
                        popperOptions: { strategy: 'fixed' },
                    });

                    if (callbacks.onOpen) callbacks.onOpen(destroyPopup);
                },

                onUpdate: (props: SuggestionProps<string>) => {
                    currentRange = props.range;
                    component?.updateProps({
                        categorizedVariables: callbacks.categorizedVariables,
                        categorizedSources: callbacks.categorizedSources,
                        onSelectVariable: (varName: string, categoryKey: keyof CategorizedVariables) => {
                            if (currentRange) callbacks.onSelectVariable(varName, currentRange, categoryKey);
                            popup?.[0]?.hide();
                        },
                        onSelectCode: (anchorRect: DOMRect | null) => {
                            if (currentRange) {
                                const rect = anchorRect || props.clientRect?.();
                                callbacks.onSelectCode(currentRange, rect ? { left: rect.left, top: rect.bottom } : null);
                            }
                            popup?.[0]?.hide();
                        },
                        onRequestClose: destroyPopup,
                    });
                    if (props.clientRect && popup?.[0]) {
                        popup[0].setProps({ getReferenceClientRect: props.clientRect as () => DOMRect });
                    }
                },

                onKeyDown: (props: SuggestionKeyDownProps) => {
                    return component?.ref?.onKeyDown(props.event) ?? false;
                },

                onExit: () => {
                    destroyPopup();
                    callbacks.onClose?.();
                },
            };
        },

        command: () => {},
    };
}

export interface VariableSuggestionOptions {
    suggestion: ReturnType<typeof createVariableSuggestionConfig>;
}

export const VariableSuggestion = Extension.create<VariableSuggestionOptions>({
    name: 'variableSuggestion',

    addOptions() {
        return { suggestion: {} as ReturnType<typeof createVariableSuggestionConfig> };
    },

    addProseMirrorPlugins() {
        return [Suggestion({ editor: this.editor, ...this.options.suggestion })];
    },
});

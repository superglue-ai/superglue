import { Extension } from '@tiptap/core';
import { ReactRenderer } from '@tiptap/react';
import Suggestion, { SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion';
import tippy, { Instance as TippyInstance } from 'tippy.js';
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { cn } from '@/src/lib/general-utils';
import { Variable, Code2, ChevronRight } from 'lucide-react';

interface VariableCommandMenuProps {
    items: string[];
    onSelectVariable: (varName: string) => void;
    onSelectCode: () => void;
}

interface VariableCommandMenuRef {
    onKeyDown: (event: KeyboardEvent) => boolean;
}

const VariableCommandMenu = forwardRef<VariableCommandMenuRef, VariableCommandMenuProps>(
    ({ items, onSelectVariable, onSelectCode }, ref) => {
        const [selectedIndex, setSelectedIndex] = useState(0);
        const totalItems = items.length + 1;

        useEffect(() => {
            setSelectedIndex(0);
        }, [items]);

        useImperativeHandle(ref, () => ({
            onKeyDown: (event: KeyboardEvent) => {
                if (event.key === 'ArrowUp') {
                    setSelectedIndex((prev) => (prev - 1 + totalItems) % totalItems);
                    return true;
                }
                if (event.key === 'ArrowDown') {
                    setSelectedIndex((prev) => (prev + 1) % totalItems);
                    return true;
                }
                if (event.key === 'Enter') {
                    if (selectedIndex < items.length) {
                        onSelectVariable(items[selectedIndex]);
                    } else {
                        onSelectCode();
                    }
                    return true;
                }
                return false;
            },
        }));

        return (
            <div className="bg-popover border rounded-lg shadow-lg overflow-hidden w-56">
                <div className="max-h-32 overflow-y-auto">
                    {items.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-muted-foreground">
                            No variables available
                        </div>
                    ) : (
                        items.map((item, index) => (
                            <button
                                key={item}
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    onSelectVariable(item);
                                }}
                                onMouseDown={(e) => e.preventDefault()}
                                className={cn(
                                    "w-full flex items-center gap-2 px-3 py-2 text-sm text-left font-mono",
                                    "hover:bg-accent transition-colors",
                                    index === selectedIndex && "bg-accent"
                                )}
                            >
                                <Variable className="h-4 w-4 text-muted-foreground shrink-0" />
                                <span className="truncate">{item}</span>
                            </button>
                        ))
                    )}
                </div>
                <div className="h-px bg-border" />
                <button
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onSelectCode();
                    }}
                    onMouseDown={(e) => e.preventDefault()}
                    className={cn(
                        "w-full flex items-center justify-between px-3 py-2 text-sm",
                        "hover:bg-accent transition-colors",
                        selectedIndex === items.length && "bg-accent"
                    )}
                >
                    <span className="flex items-center gap-2">
                        <Code2 className="h-4 w-4 text-muted-foreground" />
                        Code expression
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
            </div>
        );
    }
);

VariableCommandMenu.displayName = 'VariableCommandMenu';

interface SuggestionCallbacks {
    availableVariables: string[];
    onSelectVariable: (varName: string, range: { from: number; to: number }) => void;
    onSelectCode: (range: { from: number; to: number }, cursorCoords: { left: number; top: number }) => void;
    onEscape: (range: { from: number; to: number }) => void;
}

export function createVariableSuggestionConfig(callbacks: SuggestionCallbacks) {
    return {
        char: '@',
        allowSpaces: false,
        startOfLine: false,

        items: () => callbacks.availableVariables,

        render: () => {
            let component: ReactRenderer<VariableCommandMenuRef> | null = null;
            let popup: TippyInstance[] | null = null;
            let currentRange: { from: number; to: number } | null = null;

            return {
                onStart: (props: SuggestionProps<string>) => {
                    console.log('[VariableSuggestion] onStart called', { items: props.items, range: props.range });
                    currentRange = props.range;

                    component = new ReactRenderer(VariableCommandMenu, {
                        props: {
                            items: props.items,
                            onSelectVariable: (varName: string) => {
                                if (currentRange) {
                                    callbacks.onSelectVariable(varName, currentRange);
                                }
                                popup?.[0]?.hide();
                            },
                            onSelectCode: () => {
                                console.log('[VariableCommandMenu] Code expression clicked');
                                if (currentRange && props.clientRect) {
                                    const rect = props.clientRect();
                                    if (rect) {
                                        console.log('[VariableCommandMenu] Calling onSelectCode callback', { currentRange, rect });
                                        callbacks.onSelectCode(currentRange, { left: rect.left, top: rect.bottom });
                                    }
                                }
                                popup?.[0]?.hide();
                            },
                        },
                        editor: props.editor,
                    });

                    if (!props.clientRect) return;

                    popup = tippy('body', {
                        getReferenceClientRect: props.clientRect as () => DOMRect,
                        appendTo: () => document.body,
                        content: component.element,
                        showOnCreate: true,
                        interactive: true,
                        trigger: 'manual',
                        placement: 'bottom-start',
                        offset: [0, 4],
                        popperOptions: {
                            strategy: 'fixed',
                        },
                    });
                },

                onUpdate: (props: SuggestionProps<string>) => {
                    currentRange = props.range;

                    component?.updateProps({
                        items: props.items,
                        onSelectVariable: (varName: string) => {
                            if (currentRange) {
                                callbacks.onSelectVariable(varName, currentRange);
                            }
                            popup?.[0]?.hide();
                        },
                        onSelectCode: () => {
                            if (currentRange && props.clientRect) {
                                const rect = props.clientRect();
                                if (rect) {
                                    callbacks.onSelectCode(currentRange, { left: rect.left, top: rect.bottom });
                                }
                            }
                            popup?.[0]?.hide();
                        },
                    });

                    if (!props.clientRect || !popup?.[0]) return;
                    popup[0].setProps({
                        getReferenceClientRect: props.clientRect as () => DOMRect,
                    });
                },

                onKeyDown: (props: SuggestionKeyDownProps) => {
                    if (props.event.key === 'Escape') {
                        if (currentRange) {
                            callbacks.onEscape(currentRange);
                        }
                        popup?.[0]?.hide();
                        return true;
                    }
                    return component?.ref?.onKeyDown(props.event) ?? false;
                },

                onExit: () => {
                    popup?.[0]?.destroy();
                    component?.destroy();
                    currentRange = null;
                },
            };
        },

        command: () => {
            // Commands are handled via callbacks above
        },
    };
}

export interface VariableSuggestionOptions {
    suggestion: ReturnType<typeof createVariableSuggestionConfig>;
}

export const VariableSuggestion = Extension.create<VariableSuggestionOptions>({
    name: 'variableSuggestion',

    addOptions() {
        return {
            suggestion: {} as ReturnType<typeof createVariableSuggestionConfig>,
        };
    },

    addProseMirrorPlugins() {
        return [
            Suggestion({
                editor: this.editor,
                ...this.options.suggestion,
            }),
        ];
    },
});


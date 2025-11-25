import { cn } from '@/src/lib/general-utils';
import { truncateTemplateValue } from '@/src/lib/template-utils';
import { Code2, X } from 'lucide-react';
import { useState } from 'react';
import { TemplateEditPopover } from './TemplateEditPopover';

interface TemplateChipProps {
  template: string;
  evaluatedValue: any;
  error?: string;
  stepData: any;
  loopData?: any;
  onUpdate: (newTemplate: string) => void;
  onDelete: () => void;
  readOnly?: boolean;
  inline?: boolean;
  selected?: boolean;
}

export function TemplateChip({
  template,
  evaluatedValue,
  error,
  stepData,
  loopData,
  onUpdate,
  onDelete,
  readOnly = false,
  inline = false,
  selected = false
}: TemplateChipProps) {
  const [isHovered, setIsHovered] = useState(false);

  const truncated = truncateTemplateValue(evaluatedValue, 150);
  const hasError = !!error;
  const isUnresolved = !hasError && evaluatedValue === undefined;

  const displayText = hasError 
    ? `Error: ${error.slice(0, 50)}${error.length > 50 ? '...' : ''}`
    : isUnresolved
    ? `unresolved: ${template.replace(/^<<|>>$/g, '')}`
    : truncated.display;

  const textColor = hasError 
    ? undefined 
    : isUnresolved 
    ? undefined 
    : '#B37400';

  const chipContent = (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-1.5 rounded text-xs font-mono select-none",
        "transition-all duration-150",
        hasError && "bg-destructive/15 text-destructive border border-destructive/30",
        isUnresolved && "bg-muted text-muted-foreground border border-muted-foreground/30",
        !hasError && !isUnresolved && "border shadow-sm",
        !readOnly && "cursor-pointer",
        readOnly && "cursor-default",
        inline && "align-middle my-[-2px]"
      )}
      style={{
        ...(!hasError && !isUnresolved ? {
          backgroundColor: selected ? 'rgba(255, 165, 0, 0.3)' : 'rgba(255, 165, 0, 0.15)',
          borderColor: '#FFA500',
          boxShadow: selected 
            ? '0 0 0 2px rgba(255, 165, 0, 0.5), 0 0 8px rgba(255, 165, 0, 0.3)' 
            : '0 0 0 1px rgba(255, 165, 0, 0.3)'
        } : {}),
        ...(selected && (hasError || isUnresolved) ? {
          boxShadow: hasError 
            ? '0 0 0 2px rgba(239, 68, 68, 0.5), 0 0 8px rgba(239, 68, 68, 0.3)'
            : '0 0 0 2px rgba(100, 100, 100, 0.5), 0 0 8px rgba(100, 100, 100, 0.2)'
        } : {}),
        lineHeight: '1.4',
        paddingTop: '1px',
        paddingBottom: '1px',
        transition: 'all 0.15s ease-in-out'
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title={truncated.truncated ? `${truncated.originalSize} chars (click to view)` : undefined}
    >
      <span 
        className="w-3 h-3 flex items-center justify-center shrink-0"
        style={{ color: textColor }}
      >
        {!readOnly && isHovered ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="hover:opacity-70"
            title="Delete"
          >
            <X className="h-3 w-3" />
          </button>
        ) : (
          <Code2 className="h-3 w-3" />
        )}
      </span>
      <span 
        className="max-w-[200px] truncate"
        style={{ color: textColor }}
      >
        {displayText}
      </span>
    </span>
  );

  if (readOnly) {
    return chipContent;
  }

  return (
    <TemplateEditPopover
      template={template}
      stepData={stepData}
      loopData={loopData}
      onSave={onUpdate}
      readOnly={readOnly}
    >
      {chipContent}
    </TemplateEditPopover>
  );
}

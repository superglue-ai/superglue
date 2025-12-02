import { cn } from '@/src/lib/general-utils';
import { truncateTemplateValue, prepareSourceData, extractCredentials } from '@/src/lib/templating-utils';
import { maskCredentials } from '@superglue/shared';
import { Code2, X } from 'lucide-react';
import { useState, useMemo } from 'react';
import { TemplateEditPopover } from './TemplateEditPopover';

interface TemplateChipProps {
  template: string;
  evaluatedValue: any;
  error?: string;
  stepData: any;
  loopData?: any;
  isEvaluating?: boolean;
  canExecute?: boolean;
  onUpdate: (newTemplate: string) => void;
  onDelete: () => void;
  readOnly?: boolean;
  inline?: boolean;
  selected?: boolean;
  forcePopoverOpen?: boolean;
  onPopoverOpenChange?: (open: boolean) => void;
}

export function TemplateChip({
  template,
  evaluatedValue,
  error,
  stepData,
  loopData,
  isEvaluating = false,
  canExecute = true,
  onUpdate,
  onDelete,
  readOnly = false,
  inline = false,
  selected = false,
  forcePopoverOpen = false,
  onPopoverOpenChange
}: TemplateChipProps) {
  const sourceData = useMemo(() => prepareSourceData(stepData, loopData), [stepData, loopData]);
  const [isHovered, setIsHovered] = useState(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  
  const effectiveOpen = isPopoverOpen || forcePopoverOpen;

  const templateExpr = template.replace(/^<<|>>$/g, '').trim();

  const hasError = !!error;
  const isUnresolved = !hasError && !canExecute;
  const isResolvedUndefined = !hasError && canExecute && !isEvaluating && evaluatedValue === undefined;

  const credentials = useMemo(() => extractCredentials(sourceData), [sourceData]);

  let displayText: string;
  let isTruncated = false;
  let originalSize = 0;

  if (hasError) {
    displayText = `Error: ${error.slice(0, 50)}${error.length > 50 ? '...' : ''}`;
  } else if (isUnresolved) {
    displayText = `unresolved: ${templateExpr.slice(0, 30)}${templateExpr.length > 30 ? '...' : ''}`;
  } else if (isResolvedUndefined) {
    displayText = 'undefined';
  } else {
    let fullDisplayText: string;
    if (evaluatedValue === null) {
      fullDisplayText = 'null';
    } else if (typeof evaluatedValue === 'string') {
      fullDisplayText = evaluatedValue === '' ? '""' : evaluatedValue;
    } else if (typeof evaluatedValue === 'object') {
      try {
        fullDisplayText = JSON.stringify(evaluatedValue);
      } catch {
        fullDisplayText = '[Complex Object]';
      }
    } else {
      fullDisplayText = String(evaluatedValue);
    }

    originalSize = fullDisplayText.length;
    const masked = maskCredentials(fullDisplayText, credentials);
    const wasMasked = masked !== fullDisplayText;

    if (wasMasked) {
      const maskedTokens = masked.match(/\{masked_[^}]+\}/g) || [];
      if (maskedTokens.length > 0) {
        displayText = maskedTokens[0];
        isTruncated = masked.length > maskedTokens[0].length;
      } else {
        displayText = masked.slice(0, 150) + (masked.length > 150 ? '...' : '');
        isTruncated = masked.length > 150;
      }
    } else {
      const truncated = truncateTemplateValue(fullDisplayText, 150);
      displayText = truncated.display;
      isTruncated = truncated.truncated;
      originalSize = truncated.originalSize;
    }
  }

  const isActive = selected || effectiveOpen;
  
  const getChipClasses = () => {
    if (hasError) {
      return {
        bg: 'bg-red-500/20 dark:bg-red-500/20',
        border: isActive ? 'border-red-500/50 dark:border-red-400/50' : 'border-transparent',
        text: 'text-red-700 dark:text-red-300'
      };
    }
    
    if (isUnresolved || isResolvedUndefined) {
      return {
        bg: 'bg-gray-500/15 dark:bg-gray-400/20',
        border: isActive ? 'border-gray-400/50 dark:border-gray-500/50' : 'border-transparent',
        text: 'text-gray-600 dark:text-gray-300'
      };
    }
    
    return {
      bg: 'bg-green-600/15 dark:bg-green-400/20',
      border: isActive ? 'border-green-600/50 dark:border-green-400/50' : 'border-transparent',
      text: 'text-green-700 dark:text-green-400'
    };
  };

  const chipClasses = getChipClasses();

  const chipContent = (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-mono select-none border",
        "transition-all duration-150",
        chipClasses.bg,
        chipClasses.border,
        chipClasses.text,
        !readOnly && "cursor-pointer",
        readOnly && "cursor-default",
        inline && "align-middle"
      )}
      style={{ lineHeight: '1.3' }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title={isTruncated ? `${originalSize} chars (click to view)` : undefined}
    >
      <span className="w-3 h-3 flex items-center justify-center shrink-0">
        {isEvaluating ? (
          <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : !readOnly && isHovered ? (
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
      <span className="max-w-[200px] truncate">
        {displayText}
      </span>
    </span>
  );

  const handleOpenChange = (open: boolean) => {
    setIsPopoverOpen(open);
    if (!open) {
      onPopoverOpenChange?.(false);
    }
  };

  if (readOnly) {
    return chipContent;
  }

  return (
    <TemplateEditPopover
      template={template}
      sourceData={sourceData}
      onSave={onUpdate}
      canExecute={canExecute}
      externalOpen={effectiveOpen}
      onExternalOpenChange={handleOpenChange}
    >
      {chipContent}
    </TemplateEditPopover>
  );
}

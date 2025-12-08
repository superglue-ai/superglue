import { cn } from '@/src/lib/general-utils';
import { truncateTemplateValue, prepareSourceData, extractCredentials } from '@/src/lib/templating-utils';
import { maskCredentials } from '@superglue/shared';
import { Code2, X } from 'lucide-react';
import { useState, useMemo, useRef, useEffect } from 'react';
import { TemplateEditPopover } from './TemplateEditPopover';
import { useTemplateContext } from './tiptap/TemplateContext';

interface TemplateChipProps {
  template: string;
  evaluatedValue: any;
  error?: string;
  stepData: any;
  dataSelectorOutput?: any;
  hasResult?: boolean;
  canExecute?: boolean;
  onUpdate: (newTemplate: string) => void;
  onDelete: () => void;
  readOnly?: boolean;
  inline?: boolean;
  selected?: boolean;
  forcePopoverOpen?: boolean;
  onPopoverOpenChange?: (open: boolean) => void;
  loopMode?: boolean;
  hideDelete?: boolean;
  popoverTitle?: string;
  popoverHelpText?: string;
}

export function TemplateChip({
  template,
  evaluatedValue,
  error,
  stepData,
  dataSelectorOutput,
  hasResult = true,
  canExecute = true,
  onUpdate,
  onDelete,
  readOnly = false,
  inline = false,
  selected = false,
  forcePopoverOpen = false,
  onPopoverOpenChange,
  loopMode = false,
  hideDelete = false,
  popoverTitle,
  popoverHelpText,
}: TemplateChipProps) {
  const { sourceDataVersion } = useTemplateContext();
  const sourceData = useMemo(() => prepareSourceData(stepData, dataSelectorOutput), [stepData, dataSelectorOutput]);
  const [isHovered, setIsHovered] = useState(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  
  const effectiveOpen = isPopoverOpen || forcePopoverOpen;

  const templateExpr = template.replace(/^<<|>>$/g, '').trim();

  const hasError = !!error;
  const isUnresolved = !hasError && !canExecute;
  const isResolvedUndefined = !hasError && canExecute && hasResult && evaluatedValue === undefined;
  const isLoading = canExecute && !hasResult && evaluatedValue === undefined;
  
  const isLoopArray = loopMode && Array.isArray(evaluatedValue) && evaluatedValue.length > 0;
  const displayValue = isLoopArray ? evaluatedValue[0] : evaluatedValue;

  const credentials = useMemo(() => extractCredentials(sourceData), [sourceData]);

  let displayText: string;
  let isTruncated = false;
  let originalSize = 0;

  if (hasError) {
    displayText = `Error: ${error.slice(0, 50)}${error.length > 50 ? '...' : ''}`;
  } else if (isUnresolved) {
    displayText = `unresolved: ${templateExpr.slice(0, 30)}${templateExpr.length > 30 ? '...' : ''}`;
  } else if (isLoading) {
    displayText = '';
  } else if (isResolvedUndefined) {
    displayText = 'undefined';
  } else {
    let fullDisplayText: string;
    if (displayValue === null) {
      fullDisplayText = 'null';
    } else if (typeof displayValue === 'string') {
      fullDisplayText = displayValue === '' ? '""' : displayValue;
    } else if (typeof displayValue === 'object') {
      try {
        fullDisplayText = JSON.stringify(displayValue);
      } catch {
        fullDisplayText = '[Complex Object]';
      }
    } else {
      fullDisplayText = String(displayValue);
    }

    originalSize = fullDisplayText.length;
    const masked = maskCredentials(fullDisplayText, credentials);
    const truncated = truncateTemplateValue(masked, 150);
      displayText = truncated.display;
      isTruncated = truncated.truncated;
      originalSize = truncated.originalSize;
  }

  const isActive = selected || effectiveOpen;
  
  const getChipClasses = () => {
    if (hasError) {
      return {
        bg: 'border-red-400/20 dark:border-red-400/25',
        border: 'border-b-red-600/30 dark:border-b-red-600/35',
        text: 'text-red-700 dark:text-red-300',
        gradient: 'linear-gradient(180deg, rgba(248, 113, 113, 0.18) 0%, rgba(239, 68, 68, 0.22) 100%)',
        shadow: isActive
          ? '0 1px 0 rgba(185, 28, 28, 0.22), 0 0 11px rgba(239, 68, 68, 0.4)'
          : '0 1px 0 rgba(185, 28, 28, 0.18), 0 0 7px rgba(239, 68, 68, 0.27)'
      };
    }
    
    if (isUnresolved) {
      return {
        bg: 'border-gray-400/20 dark:border-gray-500/25',
        border: 'border-b-gray-500/30 dark:border-b-gray-600/35',
        text: 'text-gray-600 dark:text-gray-300',
        gradient: 'linear-gradient(180deg, rgba(156, 163, 175, 0.15) 0%, rgba(107, 114, 128, 0.18) 100%)',
        shadow: isActive
          ? '0 1px 0 rgba(55, 65, 81, 0.22), 0 0 9px rgba(156, 163, 175, 0.32)'
          : '0 1px 0 rgba(55, 65, 81, 0.18), 0 0 5px rgba(156, 163, 175, 0.2)'
      };
    }
    
    return {
      bg: 'border-green-400/20 dark:border-green-400/25',
      border: 'border-b-green-600/30 dark:border-b-green-600/35',
      text: 'text-green-700 dark:text-green-400',
      gradient: 'linear-gradient(180deg, rgba(34, 197, 94, 0.18) 0%, rgba(22, 163, 74, 0.22) 100%)',
        shadow: isActive
        ? '0 1px 0 rgba(21, 128, 61, 0.22), 0 0 11px rgba(74, 222, 128, 0.4)'
        : '0 1px 0 rgba(21, 128, 61, 0.18), 0 0 7px rgba(74, 222, 128, 0.27)'
    };
  };

  const chipClasses = getChipClasses();
  const chipRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!effectiveOpen || !chipRef.current) return;
    
    const chip = chipRef.current;
    const scrollParent = chip.closest('[style*="overflow"]') as HTMLElement | null;
    if (!scrollParent) return;
    
    const handleScroll = () => {
      setIsPopoverOpen(false);
      onPopoverOpenChange?.(false);
    };
    
    scrollParent.addEventListener('scroll', handleScroll);
    return () => scrollParent.removeEventListener('scroll', handleScroll);
  }, [effectiveOpen, onPopoverOpenChange]);

  const chipContent = (
    <span
      ref={chipRef}
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-mono select-none border",
        "transition-all duration-150",
        chipClasses.bg,
        chipClasses.border,
        chipClasses.text,
        !readOnly && "cursor-pointer hover:-translate-y-px active:translate-y-0.5",
        readOnly && "cursor-default",
        inline && "align-middle"
      )}
      style={{ 
        lineHeight: '1.3', 
        background: chipClasses.gradient,
        boxShadow: chipClasses.shadow 
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title={isTruncated ? `${originalSize} chars (click to view)` : undefined}
    >
      <span className="w-3 h-3 flex items-center justify-center shrink-0">
        {isLoading ? (
          <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : !readOnly && !hideDelete && isHovered ? (
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
      loopMode={loopMode}
      title={popoverTitle}
      helpText={popoverHelpText}
      sourceDataVersion={sourceDataVersion}
    >
      {chipContent}
    </TemplateEditPopover>
  );
}

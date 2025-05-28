import { Button } from '@/src/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Textarea } from '@/src/components/ui/textarea';
import { Workflow, WorkflowResult } from '@superglue/client';
import { Check, Copy } from 'lucide-react';
import { useMemo, useState } from 'react';
import { AutoSizer, List } from 'react-virtualized';
import { WorkflowCreateSuccess } from './WorkflowCreateSuccess';

const MAX_DISPLAY_SIZE = 1024 * 1024; // 1MB limit
const MAX_LINES = 10000; // Max lines to display

// Helper function with performance optimizations
const getResponseLines = (response: any): { lines: string[], truncated: boolean } => {
  if (!response) return { lines: ['No results yet...'], truncated: false };

  const jsonString = JSON.stringify(response, null, 2);

  // Check if data is too large
  if (jsonString.length > MAX_DISPLAY_SIZE) {
    const truncatedString = jsonString.substring(0, MAX_DISPLAY_SIZE) + '\n\n... [Data truncated - too large to display]';
    return {
      lines: truncatedString.split('\n'),
      truncated: true
    };
  }

  const lines = jsonString.split('\n');

  // Limit number of lines
  if (lines.length > MAX_LINES) {
    return {
      lines: [...lines.slice(0, MAX_LINES), '... [Output truncated - too many lines]'],
      truncated: true
    };
  }

  return { lines, truncated: false };
};

interface WorkflowResultsViewProps {
  activeTab: 'results' | 'transform' | 'final' | 'instructions';
  setActiveTab: (tab: 'results' | 'transform' | 'final' | 'instructions') => void;
  executionResult: WorkflowResult | null;
  finalTransform: string;
  setFinalTransform: (transform: string) => void;
  finalResult: any;
  isExecuting: boolean;
  executionError: string | null;
  showInstructionsTab?: boolean;
  currentWorkflow?: Workflow;
  credentials?: Record<string, string>;
  payload?: Record<string, any>;
}

export function WorkflowResultsView({
  activeTab,
  setActiveTab,
  executionResult,
  finalTransform,
  setFinalTransform,
  finalResult,
  isExecuting,
  executionError,
  showInstructionsTab = false,
  currentWorkflow,
  credentials,
  payload
}: WorkflowResultsViewProps) {
  // Memoize the line processing to avoid recalculation on every render
  const rawResultsData = useMemo(() =>
    getResponseLines(executionResult?.stepResults),
    [executionResult?.stepResults]
  );

  const finalResultsData = useMemo(() =>
    getResponseLines(finalResult),
    [finalResult]
  );

  const [rawCopied, setRawCopied] = useState(false);
  const [finalCopied, setFinalCopied] = useState(false);

  const handleCopyRaw = () => {
    if (executionResult?.stepResults) {
      navigator.clipboard.writeText(JSON.stringify(executionResult.stepResults, null, 2));
      setRawCopied(true);
      setTimeout(() => setRawCopied(false), 1000);
    }
  };

  const handleCopyFinal = () => {
    if (finalResult) {
      navigator.clipboard.writeText(JSON.stringify(finalResult, null, 2));
      setFinalCopied(true);
      setTimeout(() => setFinalCopied(false), 1000);
    }
  };

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="py-3 px-4 flex-shrink-0">
        <div className="flex justify-between items-center">
          <CardTitle>Results</CardTitle>
          <div className="flex gap-2">
            <Button
              variant={activeTab === 'results' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('results')}
            >
              Raw Results
            </Button>
            <Button
              variant={activeTab === 'final' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('final')}
            >
              Final Results
            </Button>
            <Button
              variant={activeTab === 'transform' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('transform')}
            >
              Transformation
            </Button>
            {showInstructionsTab && (
              <Button
                variant={activeTab === 'instructions' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setActiveTab('instructions')}
              >
                Instructions
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0 flex-grow flex flex-col overflow-hidden">
        {executionResult && (
          <div className="p-3 bg-muted border-b flex-shrink-0">
            <div className="flex flex-col gap-1">
              <div className="flex items-center">
                <span className="font-semibold mr-2">Status:</span>
                <span className={executionResult.success ? "text-green-600" : "text-red-600"}>
                  {executionResult.success ? "Success" : "Failed"}
                </span>
              </div>

              {executionResult.startedAt && (
                <div className="flex items-center">
                  <span className="font-semibold mr-2">Time:</span>
                  <span className="text-sm">
                    {new Date(executionResult.startedAt).toLocaleString()}
                    {executionResult.completedAt &&
                      ` • Duration: ${((new Date(executionResult.completedAt).getTime() - new Date(executionResult.startedAt).getTime()) / 1000).toFixed(2)}s`}
                  </span>
                </div>
              )}

              {executionError && (
                <div className="text-red-600">
                  <span className="font-semibold mr-2">Error:</span>
                  <span>{executionError}</span>
                </div>
              )}
            </div>
          </div>
        )}
        {activeTab === 'results' ? (
          executionResult ? (
            <div className="flex-grow overflow-hidden p-1 relative">
              {executionResult.stepResults && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-2 right-2 z-10 h-8 w-8"
                  onClick={handleCopyRaw}
                >
                  {rawCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              )}
              {rawResultsData.truncated && (
                <div className="text-xs text-amber-500 flex items-center gap-1.5 bg-amber-500/10 py-1 px-2 rounded mb-2">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  Large dataset detected - display has been truncated for performance
                </div>
              )}
              <AutoSizer>
                {({ height, width }) => (
                  <List
                    width={width}
                    height={height}
                    rowCount={rawResultsData.lines.length}
                    rowHeight={18}
                    rowRenderer={({ index, key, style }) => {
                      const line = rawResultsData.lines[index];
                      const indentMatch = line?.match(/^(\s*)/);
                      const indentLevel = indentMatch ? indentMatch[0].length : 0;

                      return (
                        <div
                          key={key}
                          style={{
                            ...style,
                            whiteSpace: 'pre',
                            paddingLeft: `${indentLevel * 8}px`,
                          }}
                          className="font-mono text-xs overflow-hidden text-ellipsis px-4"
                        >
                          {line?.trimLeft()}
                        </div>
                      );
                    }}
                    overscanRowCount={20}
                    className="overflow-auto"
                  />
                )}
              </AutoSizer>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center p-4">
              <p className="text-gray-500 italic">
                {isExecuting ? 'Executing workflow...' : 'No results yet. Test the workflow to see results here.'}
              </p>
            </div>
          )
        ) : activeTab === 'transform' ? (
          <div className="flex-grow overflow-auto p-4">
            <Textarea
              value={finalTransform}
              onChange={(e) => setFinalTransform(e.target.value)}
              className="font-mono text-xs w-full h-full min-h-[300px]"
              spellCheck={false}
            />
          </div>
        ) : activeTab === 'instructions' ? (
          showInstructionsTab && (
            <div className="p-4">
              <WorkflowCreateSuccess
                currentWorkflow={currentWorkflow}
                credentials={credentials}
                payload={payload}
              />
            </div>
          )
        ) : ( // activeTab === 'final'
          finalResult ? (
            <div className="flex-grow overflow-hidden p-1 relative">
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 z-10 h-8 w-8"
                onClick={handleCopyFinal}
              >
                {finalCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
              {finalResultsData.truncated && (
                <div className="text-xs text-amber-500 flex items-center gap-1.5 bg-amber-500/10 py-1 px-2 rounded mb-2">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  Large dataset detected - display has been truncated for performance
                </div>
              )}
              <AutoSizer>
                {({ height, width }) => (
                  <List
                    width={width}
                    height={height}
                    rowCount={finalResultsData.lines.length}
                    rowHeight={18}
                    rowRenderer={({ index, key, style }) => {
                      const line = finalResultsData.lines[index];
                      const indentMatch = line?.match(/^(\s*)/);
                      const indentLevel = indentMatch ? indentMatch[0].length : 0;

                      return (
                        <div
                          key={key}
                          style={{
                            ...style,
                            whiteSpace: 'pre',
                            paddingLeft: `${indentLevel * 8}px`,
                          }}
                          className="font-mono text-xs overflow-hidden text-ellipsis px-4"
                        >
                          {line?.trimLeft()}
                        </div>
                      );
                    }}
                    overscanRowCount={20}
                    className="overflow-auto"
                  />
                )}
              </AutoSizer>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center p-4">
              <p className="text-gray-500 italic">
                {isExecuting ? 'Executing workflow...' : 'No final results yet. Test the workflow to see results here.'}
              </p>
            </div>
          )
        )}
      </CardContent>
    </Card>
  );
} 
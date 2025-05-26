import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { Textarea } from '@/src/components/ui/textarea';
import { Workflow, WorkflowResult } from '@superglue/client';
import { AutoSizer, List } from 'react-virtualized';
import { WorkflowCreateSuccess } from './WorkflowCreateSuccess'

// Helper function (can be moved or passed as prop if used elsewhere)
const getResponseLines = (response: any): string[] => {
  return response ? JSON.stringify(response, null, 2).split('\n') : ['No results yet...'];
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
            <div className="flex-grow overflow-hidden p-1">
              <AutoSizer>
                {({ height, width }) => (
                  <List
                    width={width}
                    height={height}
                    rowCount={getResponseLines(executionResult?.stepResults).length}
                    rowHeight={18}
                    rowRenderer={({ index, key, style }) => {
                      const line = getResponseLines(executionResult?.stepResults)[index];
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
                    overscanRowCount={100}
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
            <div className="flex-grow overflow-hidden p-1">
              <AutoSizer>
                {({ height, width }) => (
                  <List
                    width={width}
                    height={height}
                    rowCount={getResponseLines(finalResult).length}
                    rowHeight={18}
                    rowRenderer={({ index, key, style }) => {
                      const line = getResponseLines(finalResult)[index];
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
                    overscanRowCount={100}
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
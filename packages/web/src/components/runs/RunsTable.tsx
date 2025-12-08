"use client"

import { useConfig } from '@/src/app/config-context';
import { tokenRegistry } from '@/src/lib/token-registry';
import { Badge } from "@/src/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import { Run, RunStatus, SuperglueClient } from '@superglue/shared';
import { AlertTriangle, Calendar, CheckCircle, ChevronDown, ChevronRight, Clock, Loader2, XCircle } from 'lucide-react';
import { CopyButton } from '@/src/components/tools/shared/CopyButton';
import React from 'react';

// Helper function to recursively remove null values from objects
const removeNullFields = (obj: any): any => {
  if (obj === null || obj === undefined) {
    return undefined;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(removeNullFields).filter(item => item !== undefined);
  }
  
  if (typeof obj === 'object' && obj !== null) {
    const cleaned: any = {};
    for (const [key, value] of Object.entries(obj)) {
      const cleanedValue = removeNullFields(value);
      if (cleanedValue !== undefined && cleanedValue !== null) {
        cleaned[key] = cleanedValue;
      }
    }
    return Object.keys(cleaned).length > 0 ? cleaned : undefined;
  }
  
  return obj;
};

const RunsTable = ({ id }: { id?: string }) => {
  const [runs, setRuns] = React.useState<Run[]>([]);
  const [expandedRunId, setExpandedRunId] = React.useState<string | null>(null);
  const [runDetails, setRunDetails] = React.useState<Record<string, any>>({});
  const [loadingDetails, setLoadingDetails] = React.useState<Record<string, boolean>>({});
  const [loading, setLoading] = React.useState(true);
  const [currentPage, setCurrentPage] = React.useState(0);
  const pageSize = 50;
  const config = useConfig();

  React.useEffect(() => {
    const getRuns = async () => {
      try {
        setLoading(true);

        const superglueClient = new SuperglueClient({
          endpoint: config.superglueEndpoint,
          apiKey: tokenRegistry.getToken()
        })
        const data = await superglueClient.listRuns(pageSize, currentPage * pageSize, id);
        setRuns(data.items);
      } catch (error) {
        console.error('Error fetching runs:', error);
      } finally {
        setLoading(false);
      }
    };

    getRuns();
  }, [currentPage]);

  const handleRunClick = async (run: Run) => {
    // Toggle expansion
    if (expandedRunId === run.id) {
      setExpandedRunId(null);
      return;
    }
    
    setExpandedRunId(run.id);
    
    // If we already have details, don't fetch again
    if (runDetails[run.id]) {
      return;
    }
    
    setLoadingDetails(prev => ({ ...prev, [run.id]: true }));
    
    try {
      const superglueClient = new SuperglueClient({
        endpoint: config.superglueEndpoint,
        apiKey: tokenRegistry.getToken()
      });
      
      // Get the detailed run data - try to get more details via getRun
      const detailedRun = await superglueClient.getRun(run.id);
      setRunDetails(prev => ({ ...prev, [run.id]: detailedRun || run }));
    } catch (error) {
      console.error('Error fetching run details:', error);
      // Fall back to the basic run data if we can't get details
      setRunDetails(prev => ({ ...prev, [run.id]: run }));
    } finally {
      setLoadingDetails(prev => ({ ...prev, [run.id]: false }));
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading runs...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Tool Runs</h1>
      </div>

      <div className="border rounded-lg">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[400px]">Tool ID</TableHead>
              <TableHead className="w-[110px]">Status</TableHead>
              <TableHead className="w-[180px]">Started At</TableHead>
              <TableHead className="w-[180px]">Completed At</TableHead>
              <TableHead className="w-[100px]">Duration</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...runs].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()).map((run) => (
              <React.Fragment key={run.id}>
                <TableRow 
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => handleRunClick(run)}
                >
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2 max-w-[360px]">
                      <ChevronRight 
                        className={`h-4 w-4 flex-shrink-0 transition-transform ${expandedRunId === run.id ? 'rotate-90' : ''}`}
                      />
                      <span className="truncate" title={run.toolId ?? "undefined"}>
                      {run.toolId ?? "undefined"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {run.status === RunStatus.SUCCESS ? (
                      <Badge variant="default" className="bg-emerald-500 hover:bg-emerald-500 gap-1">
                        <CheckCircle className="h-3 w-3" />
                        Success
                      </Badge>
                    ) : run.status === RunStatus.RUNNING ? (
                      <Badge variant="default" className="bg-blue-500 hover:bg-blue-500 gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Running
                      </Badge>
                    ) : run.status === RunStatus.ABORTED ? (
                      <Badge variant="default" className="bg-amber-500 hover:bg-amber-500 gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Aborted
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="hover:bg-destructive gap-1">
                        <XCircle className="h-3 w-3" />
                        Failed
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{new Date(run.startedAt).toLocaleString()}</TableCell>
                  <TableCell className="whitespace-nowrap">{run.completedAt ? new Date(run.completedAt).toLocaleString() : '-'}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {run.completedAt ? (new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) + 'ms' : '-'}
                  </TableCell>
                </TableRow>
                
                {/* Expanded Details Row */}
                {expandedRunId === run.id && (
                  <TableRow>
                    <TableCell colSpan={5} className="bg-muted/10 p-0">
                      {loadingDetails[run.id] ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                      ) : (
                        <RunDetails run={runDetails[run.id] || run} />
                      )}
                    </TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex justify-center gap-2 mt-4">
        <button
          onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
          disabled={currentPage === 0}
          className="px-4 py-2 text-sm font-medium bg-secondary hover:bg-secondary/80 border border-input rounded-md transition-colors disabled:opacity-50"
        >
          Previous
        </button>
        <span className="px-4 py-2 text-sm font-medium bg-secondary rounded-md">
          Page {currentPage + 1}
        </span>
        <button
          onClick={() => setCurrentPage(p => p + 1)}
          disabled={runs.length < pageSize}
          className="px-4 py-2 text-sm font-medium bg-secondary hover:bg-secondary/80 border border-input rounded-md transition-colors disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
};

const CollapsibleSection = ({ 
  title, 
  children, 
  defaultOpen = false,
  isFirst = false,
  isLast = false
}: { 
  title: string; 
  children: React.ReactNode;
  defaultOpen?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
}) => {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);
  
  return (
    <div className={`border-x border-t ${isLast && !isOpen ? 'border-b' : ''} ${isFirst ? 'rounded-t-lg' : ''} ${isLast ? 'rounded-b-lg' : ''}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/30 transition-colors"
      >
        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        {title}
      </button>
      {isOpen && (
        <div className={`px-3 pb-3 ${isLast ? 'border-b rounded-b-lg' : 'border-b'}`}>
          {children}
        </div>
      )}
    </div>
  );
};

const RunDetails = ({ run }: { run: any }) => {
  if (!run) return null;

  const cleanedToolConfig = run.toolConfig ? removeNullFields(run.toolConfig) : null;
  const cleanedOptions = run.options ? removeNullFields(run.options) : null;
  const cleanedToolResult = run.toolResult ? removeNullFields(run.toolResult) : null;
  const cleanedToolPayload = run.toolPayload ? removeNullFields(run.toolPayload) : null;
  
  const hasToolConfig = cleanedToolConfig && Object.keys(cleanedToolConfig).length > 0;
  const hasOptions = cleanedOptions && Object.keys(cleanedOptions).length > 0;
  const hasToolResult = cleanedToolResult && (Array.isArray(cleanedToolResult) ? cleanedToolResult.length > 0 : Object.keys(cleanedToolResult).length > 0);
  const hasToolPayload = cleanedToolPayload && Object.keys(cleanedToolPayload).length > 0;
  const hasStepResults = run.stepResults && run.stepResults.length > 0;
  const isAborted = run.status === RunStatus.ABORTED;
  const isFailed = run.status === RunStatus.FAILED;
  
  return (
    <div className="p-6 space-y-4 max-h-[600px] overflow-y-auto [scrollbar-gutter:stable]">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">Run ID</h4>
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono truncate" title={run.id}>{run.id}</span>
            <CopyButton text={run.id} />
          </div>
      </div>
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">Duration</h4>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">
              {run.completedAt ? `${new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()}ms` : '-'}
            </span>
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">Timing</h4>
          <div className="space-y-1 text-sm">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span>Started: {new Date(run.startedAt).toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
              <span>Completed: {run.completedAt ? new Date(run.completedAt).toLocaleString() : '-'}</span>
            </div>
          </div>
        </div>
      </div>

      {isFailed && run.error && (
        <div className="space-y-1">
          <h4 className="text-sm font-medium text-muted-foreground">Error Message</h4>
          <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-lg">
            <pre className="text-sm text-red-700 dark:text-red-400 whitespace-pre-wrap font-mono">
              {run.error}
            </pre>
          </div>
        </div>
      )}

      {(() => {
        const sections = [
          hasToolPayload && { key: 'payload', title: 'Tool Payload', content: (
            <div className="relative">
              <div className="absolute top-2 right-2">
                <CopyButton getData={() => JSON.stringify(cleanedToolPayload, null, 2)} />
              </div>
              <pre className="text-xs font-mono whitespace-pre-wrap overflow-x-auto bg-muted/30 p-3 pr-10 rounded-md">
                {JSON.stringify(cleanedToolPayload, null, 2)}
              </pre>
            </div>
          )},
          hasOptions && { key: 'options', title: 'Execution Options', content: (
            <div className="relative">
              <div className="absolute top-2 right-2">
                <CopyButton getData={() => JSON.stringify(cleanedOptions, null, 2)} />
              </div>
              <pre className="text-xs font-mono whitespace-pre-wrap overflow-x-auto bg-muted/30 p-3 pr-10 rounded-md">
                {JSON.stringify(cleanedOptions, null, 2)}
              </pre>
            </div>
          )},
          hasToolConfig && { key: 'config', title: 'Tool Configuration', content: (
            <div className="relative">
              <div className="absolute top-2 right-2">
                <CopyButton getData={() => JSON.stringify(cleanedToolConfig, null, 2)} />
              </div>
              <pre className="text-xs font-mono whitespace-pre-wrap overflow-x-auto bg-muted/30 p-3 pr-10 rounded-md">
                {JSON.stringify(cleanedToolConfig, null, 2)}
              </pre>
            </div>
          )},
          hasStepResults && { key: 'steps', title: `Step Results (${run.stepResults.length})`, content: (
          <div className="space-y-2">
            {run.stepResults.map((step: any, index: number) => (
                <div key={step.stepId} className="p-3 border rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">Step {index + 1}: {step.stepId}</span>
                    <Badge variant={step.success ? "default" : "destructive"} className={step.success ? "bg-emerald-500 hover:bg-emerald-500" : "hover:bg-destructive"}>
                    {step.success ? "Success" : "Failed"}
                  </Badge>
                </div>
                {step.error && (
                    <div className="p-2 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded text-xs">
                      <pre className="text-red-600 dark:text-red-500 whitespace-pre-wrap font-mono">{step.error}</pre>
                    </div>
                  )}
                  {step.data && (
                    <pre className="text-xs font-mono whitespace-pre-wrap overflow-x-auto bg-muted/30 p-2 rounded-md max-h-[200px] overflow-y-auto">
                      {JSON.stringify(removeNullFields(step.data), null, 2)}
                    </pre>
                )}
              </div>
            ))}
          </div>
          )},
          hasToolResult && { key: 'result', title: 'Tool Result', content: (
            <div className="relative">
              <div className="absolute top-2 right-2 z-10">
                <CopyButton getData={() => JSON.stringify(cleanedToolResult, null, 2)} />
        </div>
              <pre className="text-xs font-mono whitespace-pre-wrap overflow-x-auto bg-muted/30 p-3 pr-10 rounded-md max-h-[300px] overflow-y-auto">
                {JSON.stringify(cleanedToolResult, null, 2)}
            </pre>
            </div>
          )},
        ].filter(Boolean) as { key: string; title: string; content: React.ReactNode }[];

        if (sections.length === 0) return null;

        return (
          <div>
            {sections.map((section, idx) => (
              <CollapsibleSection
                key={section.key}
                title={section.title}
                isFirst={idx === 0}
                isLast={idx === sections.length - 1}
              >
                {section.content}
              </CollapsibleSection>
            ))}
          </div>
        );
      })()}
    </div>
  );
};

export { RunsTable };

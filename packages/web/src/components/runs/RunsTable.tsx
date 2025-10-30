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
import { RunResult, SuperglueClient } from '@superglue/client';
import { AlertCircle, Calendar, CheckCircle, ChevronRight, Clock, Hash, Loader2 } from 'lucide-react';
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
  const [runs, setRuns] = React.useState<RunResult[]>([]);
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

  const handleRunClick = async (run: RunResult) => {
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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tool Id</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Started At</TableHead>
              <TableHead>Completed At</TableHead>
              <TableHead>Duration</TableHead>
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
                    <div className="flex items-center gap-2">
                      <ChevronRight 
                        className={`h-4 w-4 transition-transform ${expandedRunId === run.id ? 'rotate-90' : ''}`}
                      />
                      {run.config?.id ?? "undefined"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded-full text-sm font-medium ${run.success ? 'bg-emerald-500 text-white' : 'bg-red-600 text-white'
                      }`}>
                      {run.success ? 'Success' : 'Failed'}
                    </span>
                  </TableCell>
                  <TableCell>{new Date(run.startedAt).toLocaleString()}</TableCell>
                  <TableCell>{new Date(run.completedAt).toLocaleString()}</TableCell>
                  <TableCell>
                    {(new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime())}ms
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

// Separate component for run details
const RunDetails = ({ run }: { run: any }) => {
  if (!run) return null;
  
  return (
    <div className="p-6 space-y-6 max-h-[600px] overflow-y-auto">
      {/* Header with ID */}
      <div className="flex items-center gap-2 pb-4 border-b">
        <Hash className="h-5 w-5 text-muted-foreground" />
        <h3 className="text-lg font-semibold">Run Details: {run.id}</h3>
      </div>
      
      {/* Status and Timing */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-muted-foreground">Status</h4>
          <div className="flex items-center gap-2">
            {run.success ? (
              <>
                <CheckCircle className="h-5 w-5 text-emerald-500" />
                <Badge variant="default" className="bg-emerald-500">
                  Success
                </Badge>
              </>
            ) : (
              <>
                <AlertCircle className="h-5 w-5 text-red-500" />
                <Badge variant="destructive">
                  Failed
                </Badge>
              </>
            )}
          </div>
          {run.statusCode && (
            <p className="text-sm text-muted-foreground">
              Status Code: {run.statusCode}
            </p>
          )}
        </div>

        <div className="space-y-3">
          <h4 className="text-sm font-medium text-muted-foreground">Timing</h4>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span>Started: {new Date(run.startedAt).toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
              <span>Completed: {new Date(run.completedAt).toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span>
                Duration: {(new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime())}ms
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {run.error && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-500" />
            Error Message
          </h4>
          <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-lg">
            <pre className="text-sm text-red-700 dark:text-red-400 whitespace-pre-wrap font-mono">
              {run.error}
            </pre>
          </div>
        </div>
      )}

      {/* Step Results (for tools) */}
      {run?.stepResults && run.stepResults.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">Tool Steps</h4>
          <div className="space-y-2">
            {run.stepResults.map((step: any, index: number) => (
              <div 
                key={step.stepId} 
                className="p-4 border rounded-lg space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Step {index + 1}: {step.stepId}</span>
                  </div>
                  <Badge variant={step.success ? "default" : "destructive"} className={step.success ? "bg-emerald-500" : ""}>
                    {step.success ? "Success" : "Failed"}
                  </Badge>
                </div>
                
                {step.error && (
                  <div className="mt-2 p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded">
                    <p className="text-sm font-medium text-red-700 dark:text-red-400">Step Error:</p>
                    <pre className="text-xs text-red-600 dark:text-red-500 mt-1 whitespace-pre-wrap font-mono">
                      {step.error}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Response Headers */}
      {run.headers && Object.keys(run.headers).length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">Response Headers</h4>
          <div className="p-4 bg-muted/30 rounded-lg">
            <pre className="text-xs font-mono whitespace-pre-wrap">
              {JSON.stringify(run.headers, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {/* Response Data */}
      {run.data && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">Response Data</h4>
          <div className="p-4 bg-muted/30 rounded-lg">
            <pre className="text-xs font-mono whitespace-pre-wrap overflow-x-auto">
              {JSON.stringify(run.data, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {/* Configuration */}
      {run.config && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">Configuration</h4>
          <div className="p-4 bg-muted/30 rounded-lg">
            <pre className="text-xs font-mono whitespace-pre-wrap overflow-x-auto">
              {JSON.stringify(removeNullFields(run.config), null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};

export { RunsTable };

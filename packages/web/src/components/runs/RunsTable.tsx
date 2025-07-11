"use client"

import { useConfig } from '@/src/app/config-context';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import { RunResult, SuperglueClient } from '@superglue/client';
import React from 'react';

const RunsTable = ({ id }: { id?: string }) => {
  const [runs, setRuns] = React.useState<RunResult[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [currentPage, setCurrentPage] = React.useState(0);
  const pageSize = 50;
  const config = useConfig();

  React.useEffect(() => {
    const getRuns = async () => {
      try {
        const superglueClient = new SuperglueClient({
          endpoint: config.superglueEndpoint,
          apiKey: config.superglueApiKey
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

  if (loading) {
    return "";
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Workflow Runs</h1>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Workflow Id</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Started At</TableHead>
              <TableHead>Completed At</TableHead>
              <TableHead>Duration</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...runs].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()).map((run) => (
              <TableRow key={run.id}>
                <TableCell className="font-medium">{run.config?.id ?? "undefined"}</TableCell>
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

export { RunsTable };

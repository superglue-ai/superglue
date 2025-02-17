"use client"

import React from 'react';
import { useRouter } from 'next/navigation';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import { RunResult } from '@superglue/client';
import { useConfig } from '../config-context';
import { SuperglueClient } from '@superglue/client';
import { Button } from '@/src/components/ui/button';

const RunsTable = () => {
  const router = useRouter();
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
        const data = await superglueClient.listRuns(pageSize, currentPage * pageSize);
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
      <div className="p-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">API Runs</h1>
        </div>

        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>API Id</TableHead>
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
                    <span className={`px-2 py-1 rounded-full text-sm ${
                      run.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {run.success ? 'Success' : 'Failed'}
                    </span>
                  </TableCell>
                  <TableCell>{new Date(run.startedAt).toLocaleString()}</TableCell>
                  <TableCell>{new Date(run.completedAt).toLocaleString()}</TableCell>
                  <TableCell>
                    {((new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 1000).toFixed(2)}s
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-center space-x-2 py-4 gap-4">
          <Button
            onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
            disabled={currentPage === 0}
            variant="outline"
            >
            Previous
          </Button>
          <div className="text-sm">
            Page {currentPage + 1}
          </div>
          <Button
            onClick={() => setCurrentPage(p => p + 1)}
            disabled={runs.length < pageSize}
            variant="outline"
            >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
};

export default RunsTable;
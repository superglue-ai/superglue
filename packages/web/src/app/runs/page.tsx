"use client"

import React from 'react';
import { RunsTable } from '../../components/runsTable';

export default function RunsPage() {
  return (
    <div className="p-8 max-w-none w-full min-h-full">
      <RunsTable />
    </div>
  );
}
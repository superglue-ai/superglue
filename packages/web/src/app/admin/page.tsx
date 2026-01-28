"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AdminContent } from "@/src/components/admin/AdminContent";
import { OverviewView } from "@/src/components/admin/views/OverviewView";
import { Loader2 } from "lucide-react";

function AdminPageContent() {
  const searchParams = useSearchParams();
  const view = searchParams.get("view"); // null = overview

  return <div className="p-6 h-full">{view ? <AdminContent view={view} /> : <OverviewView />}</div>;
}

export default function AdminPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <AdminPageContent />
    </Suspense>
  );
}

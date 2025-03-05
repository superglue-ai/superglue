"use client"

import { RunsTable } from "@/src/components/runsTable";
import { Button } from "@/src/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useParams, useRouter } from "next/navigation";

export default function RunsPage() {
    const { id } = useParams();     
    const router = useRouter();
    
    return (
        <div className="p-8 max-w-none w-full min-h-full">
            <Button
                variant="ghost"
                onClick={() => router.push('/configs')}
                className="mb-4"
            >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
            </Button>
            <RunsTable id={id as string} />
        </div>
    );
}
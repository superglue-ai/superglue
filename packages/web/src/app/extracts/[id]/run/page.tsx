'use client'

import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { ExtractPlayground } from "@/src/components/extract/ExtractPlayground";
export default function ExtractPlaygroundPage({ extractId }: { extractId?: string }) {
  const params = useParams();
  const id = extractId || params.id as string;
  const router = useRouter();

  return (
    <div className="mx-auto">
      <div className="lg:p-6">
        <div className="flex justify-between items-center my-4">
          <Button
            variant="ghost"
            onClick={() => router.push('/configs')} 
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </div>

        <div className="max-w-full lg:-mx-6">
          <ExtractPlayground extractId={id} />
        </div>
      </div>
    </div>
  );
}

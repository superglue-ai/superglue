"use client";

import ApiConfigForm from "@/src/components/api/ApiConfigForm";
import { useParams } from "next/navigation";

export default function EditConfigPage() {
  const params = useParams();
  const id = params.id as string;

  return <ApiConfigForm id={id} />;
}

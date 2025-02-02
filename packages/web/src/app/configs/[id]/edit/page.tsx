'use client'

import { useParams } from "next/navigation";
import React from "react";
import ApiConfigForm from "@/src/app/configs/new/page"

export default function EditConfigPage() {
  const params = useParams();
  const id = params.id as string;

  return <ApiConfigForm id={id}/>
}

"use client";
import TransformPlayground from "@/src/components/transform/TransformPlayground";
import { useParams } from "next/navigation";

export default function TransformsPage() {
  const params = useParams();
  const id = params.id as string;

  return <TransformPlayground id={id} />
}
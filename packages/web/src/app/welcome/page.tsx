"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function WelcomePage() {
  const router = useRouter();

  useEffect(() => {
    // Welcome modal is now integrated into the auth modal
    // Redirect to home page
    router.push("/");
  }, [router]);

  return null;
}

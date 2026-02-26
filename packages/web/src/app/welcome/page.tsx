"use client";

import { Button } from "@/src/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { useRouter } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import { useEffect, useState } from "react";
import { useConfig } from "../config-context";
import { createSuperglueClient } from "@/src/lib/client-utils";
import { Loader2 } from "lucide-react";

export default function WelcomePage() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const posthog = usePostHog();
  const config = useConfig();

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_DISABLE_WELCOME_SCREEN === "true") {
      router.push("/");
      return;
    }

    const checkTenantInfo = async () => {
      try {
        const client = createSuperglueClient(config.apiEndpoint);
        const data = await client.getTenantInfo();

        if (data?.email || data?.emailEntrySkipped) {
          router.push("/");
        }
      } catch (err) {
        console.error("Error checking tenant info:", err);
      } finally {
        setLoading(false);
      }
    };

    checkTenantInfo();
  }, [router, config.apiEndpoint]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email) {
      setError("Email is required");
      return;
    }

    // Simple email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError("Please enter a valid email address");
      return;
    }

    setIsSubmitting(true);

    try {
      posthog.capture("sh_email_acquired", {
        email,
        distinct_id: email,
        userProperty: {
          email: email,
        },
      });

      const client = createSuperglueClient(config.apiEndpoint);
      await client.setTenantInfo({ email, emailEntrySkipped: false });

      // Store in cookies for better performance
      document.cookie = `sg_tenant_email=${encodeURIComponent(email)}; path=/; max-age=31536000; SameSite=Strict`;
      document.cookie =
        "sg_tenant_emailEntrySkipped=false; path=/; max-age=31536000; SameSite=Strict";

      posthog.identify(email, {
        email: email,
      });

      // Use window.location instead of router.push to force a full page reload
      // probably cloud still use router.push if i do a router.refresh() before
      // see: https://github.com/vercel/next.js/issues/58025
      window.location.href = "/";
    } catch (err) {
      console.error(err);
      setError("Failed to submit email. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkip = async () => {
    try {
      const client = createSuperglueClient(config.apiEndpoint);
      await client.setTenantInfo({ emailEntrySkipped: true });

      // Store in cookies
      document.cookie =
        "sg_tenant_emailEntrySkipped=true; path=/; max-age=31536000; SameSite=Strict";

      // Use window.location instead of router.push to force a full page reload
      window.location.href = "/";
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1 text-center">
            <CardTitle className="text-2xl">Loading...</CardTitle>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl">Welcome to superglue</CardTitle>
          <CardDescription>Enter your email to receive security-relevant updates</CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            {error && <div className="text-red-500 text-sm">{error}</div>}

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                "Continue"
              )}
            </Button>
          </form>
        </CardContent>

        <CardFooter className="flex justify-end pt-0">
          <span
            className="text-xs text-gray-600 hover:text-gray-700 cursor-pointer transition-colors"
            onClick={handleSkip}
          >
            skip
          </span>
        </CardFooter>
      </Card>
    </div>
  );
}

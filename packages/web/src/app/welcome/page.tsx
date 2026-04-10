"use client";

import { useRouter } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import { useEffect, useState } from "react";
import { useSuperglueClient } from "@/src/queries/use-client";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";

export default function WelcomePage() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const posthog = usePostHog();
  const createClient = useSuperglueClient();

  const tenantQuery = useQuery({
    queryKey: ["tenant-info"],
    queryFn: async () => {
      const client = createClient();
      return client.getTenantInfo();
    },
    enabled: process.env.NEXT_PUBLIC_DISABLE_WELCOME_SCREEN !== "true",
  });

  const shouldRedirect =
    process.env.NEXT_PUBLIC_DISABLE_WELCOME_SCREEN === "true" ||
    tenantQuery.data?.email ||
    tenantQuery.data?.emailEntrySkipped;

  useEffect(() => {
    if (shouldRedirect) {
      router.push("/");
    }
  }, [shouldRedirect, router]);

  if (shouldRedirect) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email) {
      setError("Email is required");
      return;
    }

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

      const client = createClient();
      await client.setTenantInfo({ email, emailEntrySkipped: false });

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
      const client = createClient();
      await client.setTenantInfo({ emailEntrySkipped: true });

      document.cookie =
        "sg_tenant_emailEntrySkipped=true; path=/; max-age=31536000; SameSite=Strict";

      window.location.href = "/";
    } catch (err) {
      console.error(err);
    }
  };

  if (tenantQuery.isLoading) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-background">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.16),_transparent_34%),radial-gradient(circle_at_bottom_right,_rgba(255,255,255,0.08),_transparent_30%)] dark:bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.08),_transparent_34%),radial-gradient(circle_at_bottom_right,_rgba(255,255,255,0.05),_transparent_30%)]" />
        <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />
        <div className="relative z-10 flex min-h-screen items-center justify-center p-4">
          <Card className="w-full max-w-md overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br from-muted/50 to-muted/30 dark:from-muted/50 dark:to-muted/30 backdrop-blur-xl shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <CardHeader className="space-y-3 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-border/40 bg-background/50 backdrop-blur-sm shadow-sm">
                <img src="/logo.svg" alt="superglue" className="h-7 w-7 object-contain" />
              </div>
              <CardTitle className="text-2xl">Loading...</CardTitle>
              <CardDescription>Checking your workspace setup.</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.18),_transparent_34%),radial-gradient(circle_at_bottom_right,_rgba(255,255,255,0.08),_transparent_30%)] dark:bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.08),_transparent_34%),radial-gradient(circle_at_bottom_right,_rgba(255,255,255,0.05),_transparent_30%)]" />
      <div className="pointer-events-none absolute -left-24 top-12 h-64 w-64 rounded-full bg-foreground/5 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-72 w-72 rounded-full bg-foreground/5 blur-3xl" />
      <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />

      <div className="relative z-10 flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br from-muted/50 to-muted/30 dark:from-muted/50 dark:to-muted/30 backdrop-blur-xl shadow-2xl animate-in fade-in zoom-in-95 duration-200">
          <CardHeader className="space-y-4 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-border/40 bg-background/50 backdrop-blur-sm shadow-sm">
              <img src="/logo.svg" alt="superglue" className="h-8 w-8 object-contain" />
            </div>
            <div className="space-y-1.5">
              <CardTitle className="text-2xl">Welcome to superglue</CardTitle>
              <CardDescription className="mx-auto max-w-sm text-sm leading-6">
                Share an email if you want product updates and important notices about changes to
                the OSS.
              </CardDescription>
            </div>
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
                  className="h-11 rounded-xl border-border/50 bg-background/45 backdrop-blur-sm shadow-sm"
                />
              </div>

              {error && (
                <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}

              <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
                <Button
                  type="button"
                  variant="glass"
                  onClick={handleSkip}
                  disabled={isSubmitting}
                  className="w-full sm:w-auto"
                >
                  Skip for now
                </Button>
                <Button
                  type="submit"
                  variant="glass-primary"
                  className="w-full sm:w-auto"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    "Continue"
                  )}
                </Button>
              </div>
            </form>
          </CardContent>

          <CardFooter className="border-t border-border/35 bg-background/20 pt-4 text-xs text-muted-foreground">
            We only ask once, and you can skip this without affecting the app.
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { setAuthCookies, type AuthCredentials } from "@/src/lib/auth-cookies";

interface AuthModalProps {
  isOpen: boolean;
  defaultApiUrl?: string;
}

export function AuthModal({ isOpen, defaultApiUrl }: AuthModalProps) {
  const [apiKey, setApiKey] = useState("");
  const [apiUrl, setApiUrl] = useState(defaultApiUrl || "http://localhost:3002");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!apiKey.trim()) {
      setError("API key is required");
      return;
    }

    if (!apiUrl.trim()) {
      setError("API URL is required");
      return;
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Please enter a valid email address");
      return;
    }

    setIsSubmitting(true);

    try {
      // Validate the credentials by trying to list tools (requires valid auth)
      const response = await fetch(`${apiUrl}/v1/tools`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setError("Invalid API key");
        } else if (response.status === 404) {
          setError("API endpoint not found. Please check the URL.");
        } else {
          setError(
            `Failed to connect to API (HTTP ${response.status}). Please check your credentials.`,
          );
        }
        setIsSubmitting(false);
        return;
      }

      // Verify response is valid JSON
      try {
        await response.json();
      } catch {
        setError("Connected but received invalid response. Please check the API URL.");
        setIsSubmitting(false);
        return;
      }

      // Save tenant info (email) if provided
      try {
        await fetch(`${apiUrl}/v1/tenant`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            email: email || undefined,
            emailEntrySkipped: !email,
          }),
        });

        // Store in cookies for faster checks
        if (email) {
          document.cookie = `sg_tenant_email=${encodeURIComponent(email)}; path=/; max-age=31536000; SameSite=Strict`;
        } else {
          document.cookie = `sg_tenant_emailEntrySkipped=true; path=/; max-age=31536000; SameSite=Strict`;
        }
      } catch (err) {
        // Don't fail auth if tenant info fails
        console.error("Failed to save tenant info:", err);
      }

      const credentials: AuthCredentials = { apiKey, apiUrl };
      setAuthCookies(credentials);

      // Hard refresh to reload the app with new credentials
      window.location.reload();
    } catch (err) {
      setError("Failed to connect to API. Please check the URL and try again.");
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-[425px]" onPointerDownOutside={(e) => e.preventDefault()}>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Welcome to Superglue</DialogTitle>
            <DialogDescription>Enter your credentials to access the application.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="apiUrl">API URL</Label>
              <Input
                id="apiUrl"
                type="url"
                placeholder="http://localhost:3002"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                disabled={isSubmitting}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="apiKey">API Key</Label>
              <Input
                id="apiKey"
                type="password"
                placeholder="Enter your API key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                disabled={isSubmitting}
                required
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Email (optional)</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSubmitting}
              />
              <p className="text-xs text-muted-foreground">Receive security-relevant updates</p>
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Connecting..." : "Connect"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

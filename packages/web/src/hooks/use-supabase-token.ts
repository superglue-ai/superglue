import { useEffect, useState, useMemo, useRef } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { SupabaseClient } from "@supabase/supabase-js";

export function useSupabaseToken(
  supabaseUrl: string | undefined,
  supabaseAnonKey: string | undefined,
  initialToken: string,
): { supabase: SupabaseClient | null; token: string | null } {
  const [currentApiKey, setCurrentApiKey] = useState<string | null>(initialToken);

  const supabase = useMemo(() => {
    if (!supabaseUrl || !supabaseAnonKey || supabaseUrl === "https://placeholder.supabase.co") {
      return null;
    }

    return createBrowserClient<any>(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
      },
      cookieOptions: {
        sameSite: "none", // attention: this is required for the marketing site's iframes to work
        secure: true,
      },
    });
  }, [supabaseUrl, supabaseAnonKey]);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      setCurrentApiKey(session?.access_token ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  return { supabase, token: currentApiKey };
}

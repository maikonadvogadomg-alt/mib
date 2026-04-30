import { useState, useEffect, useRef } from "react";
import { useApp } from "@/context/AppContext";

const TERMUX_URL = "http://localhost:8080";
const CLOUD_URL = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
  : "";
const CHECK_MS = 8000;

async function ping(base: string): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const r = await fetch(`${base}/api/healthz`, { signal: ctrl.signal });
    clearTimeout(t);
    return r.ok;
  } catch {
    return false;
  }
}

export function useApiBase(): string {
  const { settings } = useApp();
  const custom = settings.customServerUrl?.trim();

  const initial = CLOUD_URL || TERMUX_URL;
  const [active, setActive] = useState<string>(initial);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (custom) {
      const url = custom.replace(/\/$/, "");
      setActive(url.startsWith("http") ? url : `http://${url}`);
      if (timer.current) clearInterval(timer.current);
      return;
    }

    let cancelled = false;

    async function detect() {
      if (await ping(TERMUX_URL)) {
        if (!cancelled) setActive(TERMUX_URL);
      } else if (CLOUD_URL && await ping(CLOUD_URL)) {
        if (!cancelled) setActive(CLOUD_URL);
      }
    }

    detect();
    timer.current = setInterval(detect, CHECK_MS);
    return () => {
      cancelled = true;
      if (timer.current) clearInterval(timer.current);
    };
  }, [custom]);

  return active;
}

export function getDefaultDomain(): string {
  return process.env.EXPO_PUBLIC_DOMAIN ?? "";
}

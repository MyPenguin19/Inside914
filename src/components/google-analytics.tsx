"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { ANALYTICS_PATHS, GOOGLE_ANALYTICS_BOOTSTRAP, GOOGLE_ANALYTICS_ID } from "@/lib/analytics";

export function GoogleAnalytics() {
  const pathname = usePathname();
  if (!ANALYTICS_PATHS.some(path => path === pathname)) return null;

  return <>
    <Script id="google-analytics-init" strategy="afterInteractive">{GOOGLE_ANALYTICS_BOOTSTRAP}</Script>
    <Script src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ANALYTICS_ID}`} strategy="afterInteractive" />
  </>;
}

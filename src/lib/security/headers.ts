// Security headers for every response (applied in next.config.ts). The CSP follows Next's
// "without nonces" setup: nonces would force every page to render dynamically. 'unsafe-inline'
// scripts are still needed for Next's inline bootstrap; the policy's main protections are no
// framing, no plugins, no foreign base/form targets, and a short list of allowed origins.
//
// The CSP ships REPORT-ONLY first: browsers log violations in the console without blocking, so a
// missed Stripe or Supabase origin can't break checkout. Enforce it (CSP_ENFORCED) once a real
// booking runs with a clean console.
export const CSP_ENFORCED = false;

type Options = { supabaseUrl: string | undefined; dev: boolean; preview: boolean };

const STRIPE_SCRIPTS = ["https://js.stripe.com", "https://*.js.stripe.com"];
const STRIPE_FRAMES = [...STRIPE_SCRIPTS, "https://hooks.stripe.com"];
const STRIPE_API = ["https://api.stripe.com"];
const VERCEL_TOOLBAR = ["https://vercel.live"]; // preview deployments' comment toolbar

function origin(url: string | undefined) {
  try {
    return url ? new URL(url).origin : null;
  } catch {
    return null;
  }
}

export function contentSecurityPolicy({ supabaseUrl, dev, preview }: Options) {
  const supabase = origin(supabaseUrl);
  const own = supabase ? [supabase] : [];
  const toolbar = preview ? VERCEL_TOOLBAR : [];
  const policy: [string, string[]][] = [
    ["default-src", ["'self'"]],
    ["script-src", ["'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : []), ...STRIPE_SCRIPTS, ...toolbar]],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", ["'self'", "data:", "blob:", ...own, "https://*.stripe.com", ...toolbar]],
    ["font-src", ["'self'", "data:", ...toolbar]],
    ["connect-src", ["'self'", ...own, ...STRIPE_API, ...toolbar]],
    ["frame-src", [...STRIPE_FRAMES, ...toolbar]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
  ];
  const directives = policy.map(([name, values]) => `${name} ${values.join(" ")}`);
  // Browsers ignore this directive in report-only mode and log a warning on every page.
  // HTTPS/HSTS remain enforced independently; include the upgrade when CSP is enforced.
  if (!dev && CSP_ENFORCED) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

export function securityHeaders(options: Options) {
  const headers = [
    { key: CSP_ENFORCED ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only", value: contentSecurityPolicy(options) },
    { key: "X-Frame-Options", value: "DENY" }, // enforced now, for browsers and before the CSP is
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: 'camera=(), microphone=(), geolocation=(), browsing-topics=(), payment=(self "https://js.stripe.com" "https://*.js.stripe.com")',
    },
  ];
  if (!options.dev) headers.push({ key: "Strict-Transport-Security", value: "max-age=63072000" });
  return headers;
}

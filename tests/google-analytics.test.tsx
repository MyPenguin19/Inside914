import { createContext, runInContext } from "node:vm";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, test, vi } from "vitest";
import type { ScriptProps } from "next/script";
import { ANALYTICS_PATHS, GOOGLE_ANALYTICS_BOOTSTRAP, GOOGLE_ANALYTICS_ID } from "@/lib/analytics";

const route = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));
vi.mock("next/script", () => ({ default: ({ id, src, children }: ScriptProps) => <script id={id} src={src} async>{children}</script> }));
vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "sans" }),
  Geist_Mono: () => ({ variable: "mono" }),
  Fraunces: () => ({ variable: "serif" }),
}));
import RootLayout, { metadata } from "@/app/layout";
import { GoogleAnalytics } from "@/components/google-analytics";

afterEach(() => { vi.unstubAllEnvs(); route.pathname = "/"; });

function bootstrap(path = "/") {
  const context = createContext({ location: new URL(path, "https://inside914.com") });
  context.window = context;
  runInContext(GOOGLE_ANALYTICS_BOOTSTRAP, context);
  return context;
}

test("verification token uses Next metadata and Analytics uses the requested property", () => {
  expect(metadata.verification).toEqual({ google: "rMoAZMl3ESy4TOux7nGxSLj2NspSwIkUWYGhamKBcWE" });
  expect(GOOGLE_ANALYTICS_ID).toBe("G-G93Q0PE5JS");
  const context = bootstrap();
  const commands = context.dataLayer.map((args: IArguments) => Array.from(args));
  expect(commands[0][0]).toBe("js");
  expect(commands[1]).toEqual(["config", GOOGLE_ANALYTICS_ID, {
    page_referrer: "", allow_google_signals: false, allow_ad_personalization_signals: false,
  }]);
  // The standard tag handles page views; don't also send duplicate manual events.
  expect(commands).toHaveLength(2);
});

test.each(ANALYTICS_PATHS)("marketing page %s loads the tag and permits measurement", (path) => {
  route.pathname = path;
  const markup = renderToStaticMarkup(<GoogleAnalytics />);
  expect(markup).toContain(`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ANALYTICS_ID}`);
  expect(markup).toContain('id="google-analytics-init"');
  expect(bootstrap(path)[`ga-disable-${GOOGLE_ANALYTICS_ID}`]).toBe(false);
});

test.each(["/contact", "/admin/login", "/admin/campaigns", "/book/cart", "/reservation/private-token", "/pay", "/r/private-token", "/legal/privacy", "/unknown"])("private or excluded page %s never loads the tag", (path) => {
  route.pathname = path;
  expect(renderToStaticMarkup(<GoogleAnalytics />)).toBe("");
  expect(bootstrap(path)[`ga-disable-${GOOGLE_ANALYTICS_ID}`]).toBe(true);
});

test("opt-out follows navigation synchronously, including query and fragment tokens", () => {
  const context = bootstrap();
  const key = `ga-disable-${GOOGLE_ANALYTICS_ID}`;
  for (const path of ["/contact", "/admin", "/reservation/access?token=private", "/?token=private", "/#access_token=private"]) {
    context.location = new URL(path, "https://inside914.com");
    expect(context[key], path).toBe(true);
  }
  context.location = new URL("https://inside914.com/areas");
  expect(context[key]).toBe(false);
});

test.each([undefined, "development", "preview", "production"])("Analytics is production-only, VERCEL_ENV=%s", (environment) => {
  vi.stubEnv("VERCEL_ENV", environment);
  const html = renderToStaticMarkup(<RootLayout params={Promise.resolve({})}>Page</RootLayout>);
  expect(html.includes("googletagmanager.com")).toBe(environment === "production");
});

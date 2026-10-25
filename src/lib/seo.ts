// Public SEO URLs only. Never add private tokens, checkout sessions, or admin routes.
export const SITE_URL = "https://inside914.vercel.app";
export const SITE_NAME = "Inside914";
export const SEO_CONTACT_EMAIL = "Info@inside914.com";
export const PUBLIC_MARKETING_PATHS = ["/", "/areas", "/areas/central-westchester", "/areas/southern-westchester", "/areas/northern-westchester", "/areas/eastern-westchester"] as const;
export const PRIVATE_ROBOTS = { index: false, follow: false, noarchive: true } as const;
export function absoluteUrl(path = "/") { return new URL(path, SITE_URL).toString(); }

import { PUBLIC_MARKETING_PATHS } from "@/lib/seo";

export const GOOGLE_ANALYTICS_ID = "G-G93Q0PE5JS";

// Google's documented opt-out flag is checked before sending events. Read the current
// URL each time: the loaded tag survives Next.js navigation to private/tokenized pages.
// Parameterized URLs are excluded, and referrers omitted, to avoid sharing access tokens.
export const GOOGLE_ANALYTICS_BOOTSTRAP = `
  Object.defineProperty(window, 'ga-disable-${GOOGLE_ANALYTICS_ID}', {
    configurable: true,
    get: function () {
      return !${JSON.stringify(PUBLIC_MARKETING_PATHS)}.includes(window.location.pathname)
        || Boolean(window.location.search || window.location.hash);
    }
  });
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', '${GOOGLE_ANALYTICS_ID}', {
    page_referrer: '',
    allow_google_signals: false,
    allow_ad_personalization_signals: false
  });
`;

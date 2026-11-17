/**
 * Which "View in AR" experience this browser gets (pure, unit-tested; no three.js). Order matters:
 * 1. "webxr"     Android Chrome with ARCore: the live WebXR scene (AR-1b).
 * 2. "quicklook" iPhone/iPad browsers that open <a rel="ar"> in AR Quick Look (AR-1c).
 * 3. "in-app"    a phone whose in-app browser (Instagram, Facebook, WhatsApp on Android…) can do neither: explain how to open the card in Safari/Chrome.
 * 4. "desktop"   a computer: show the card's QR code to open it on a phone.
 * 5. null        any other phone or tablet without AR: no button, the card is exactly as before.
 */
export type ArRoute = "webxr" | "quicklook" | "in-app" | "desktop" | null;

const IN_APP: [RegExp, string][] = [
  [/Instagram/i, "Instagram"], [/FBAN|FBAV|FB_IAB|FBIOS/i, "Facebook"], [/Messenger|FB_MESSENGER/i, "Messenger"], [/WhatsApp/i, "WhatsApp"],
  [/Snapchat/i, "Snapchat"], [/TikTok|musical_ly|BytedanceWebview/i, "TikTok"], [/\bLine\//, "LINE"], [/MicroMessenger/i, "WeChat"],
  [/LinkedInApp/i, "LinkedIn"], [/Pinterest/i, "Pinterest"], [/Twitter|TwitterAndroid/i, "X"], [/GSA\//, "Google app"],
];

/** The app whose built-in browser this is, or null for a normal browser. Android WebViews without a known app name report "an app". */
export function inAppBrowser(ua: string): string | null {
  for (const [re, name] of IN_APP) if (re.test(ua)) return name;
  if (/Android/.test(ua) && /; wv\)/.test(ua)) return "an app";
  return null;
}

export function isAndroid(ua: string) { return /Android/i.test(ua); }
export function isIOS(ua: string, touchPoints = 0) { return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1); } // iPadOS asks for desktop sites
export function isPhoneOrTablet(ua: string, touchPoints = 0) { return isAndroid(ua) || isIOS(ua, touchPoints) || /Mobile|Tablet|Silk|Kindle/i.test(ua); }

export function chooseArRoute(o: { webxr: boolean; quickLook: boolean; ua: string; touchPoints?: number }): ArRoute {
  if (o.webxr) return "webxr";
  if (o.quickLook) return "quicklook";
  const mobile = isPhoneOrTablet(o.ua, o.touchPoints);
  if (mobile) return inAppBrowser(o.ua) && (isAndroid(o.ua) || isIOS(o.ua, o.touchPoints)) ? "in-app" : null;
  return "desktop";
}

/** Android only: a link that asks the system to open this page in Chrome (in-app browsers usually honour it). */
export function chromeIntent(href: string) {
  const u = new URL(href);
  return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=${u.protocol.replace(":", "")};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(href)};end`;
}

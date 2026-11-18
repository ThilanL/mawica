import { describe, expect, it } from "vitest";
import { chooseArRoute, chromeIntent, inAppBrowser } from "@/components/cards/arSupport";

const UA = {
  androidChrome: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  androidInstagram: "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.0.0 Mobile Safari/537.36 Instagram 350.0.0.0.0 Android",
  androidWhatsApp: "Mozilla/5.0 (Linux; Android 13; SM-S911B; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36 WhatsApp/2.24",
  androidWebView: "Mozilla/5.0 (Linux; Android 12; SM-A525F; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.0.0 Mobile Safari/537.36",
  androidFirefox: "Mozilla/5.0 (Android 14; Mobile; rv:132.0) Gecko/132.0 Firefox/132.0",
  iphoneSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  iphoneFacebook: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22B83 [FBAN/FBIOS;FBAV/490.0.0;FBBV/1]",
  iphoneInstagram: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22B83 Instagram 350.0.0 (iPhone15,2; iOS 18_1)",
  ipadDesktopMode: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
  macChrome: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  windowsEdge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
};

describe("AR-1d: which AR experience a browser gets", () => {
  it("AR-capable browsers get AR, WebXR first", () => {
    expect(chooseArRoute({ webxr: true, quickLook: false, ua: UA.androidChrome })).toBe("webxr");
    expect(chooseArRoute({ webxr: false, quickLook: true, ua: UA.iphoneSafari })).toBe("quicklook");
    expect(chooseArRoute({ webxr: true, quickLook: true, ua: UA.androidChrome })).toBe("webxr");
    expect(chooseArRoute({ webxr: false, quickLook: true, ua: UA.iphoneInstagram })).toBe("quicklook"); // if an in-app browser can do it, use it
  });
  it("in-app browsers on phones that can't do AR get 'open in your browser'", () => {
    for (const ua of [UA.androidInstagram, UA.androidWhatsApp, UA.androidWebView, UA.iphoneFacebook, UA.iphoneInstagram]) expect(chooseArRoute({ webxr: false, quickLook: false, ua }), ua).toBe("in-app");
    expect(inAppBrowser(UA.androidInstagram)).toBe("Instagram");
    expect(inAppBrowser(UA.iphoneFacebook)).toBe("Facebook");
    expect(inAppBrowser(UA.androidWhatsApp)).toBe("WhatsApp");
    expect(inAppBrowser(UA.androidWebView)).toBe("an app");
    expect(inAppBrowser(UA.androidChrome)).toBeNull();
    expect(inAppBrowser(UA.iphoneSafari)).toBeNull();
  });
  it("ordinary phones and tablets without AR get no button; computers get the QR hand-off", () => {
    expect(chooseArRoute({ webxr: false, quickLook: false, ua: UA.androidFirefox })).toBeNull();
    expect(chooseArRoute({ webxr: false, quickLook: false, ua: UA.androidChrome })).toBeNull(); // Android without ARCore
    expect(chooseArRoute({ webxr: false, quickLook: false, ua: UA.ipadDesktopMode, touchPoints: 5 })).toBeNull();
    expect(chooseArRoute({ webxr: false, quickLook: false, ua: UA.macChrome })).toBe("desktop");
    expect(chooseArRoute({ webxr: false, quickLook: false, ua: UA.windowsEdge })).toBe("desktop");
  });
  it("the Android open-in-Chrome link keeps the card address and falls back to it", () => {
    const i = chromeIntent("https://www.mawica.com/c/abc123def456?x=1");
    expect(i).toBe("intent://www.mawica.com/c/abc123def456?x=1#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=https%3A%2F%2Fwww.mawica.com%2Fc%2Fabc123def456%3Fx%3D1;end");
  });
});

import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));
import { capText, clampLines, graphemes, isRtl, layoutWish, PANEL_MESSAGE_LINES, wrapLines } from "@/components/cards/premium3d/ar/wish";

const mono = (s: string) => graphemes(s).length * 10; // 10 px per grapheme
const m = { body: mono, title: mono, small: mono };

describe("AR wish text", () => {
  it("never splits an emoji, a flag or an accented letter", () => {
    const s = "Joyeux Noël 👨‍👩‍👧‍👦🇱🇰 é";
    expect(graphemes(s)).toContain("👨‍👩‍👧‍👦");
    expect(graphemes(s)).toContain("🇱🇰");
    const cut = capText("😀".repeat(30), 10);
    expect(graphemes(cut)).toHaveLength(10);
    expect(cut.endsWith("…")).toBe(true);
    expect(cut).not.toMatch(/�/);
  });
  it("short text is untouched; long text is cut at a word with an ellipsis", () => {
    expect(capText("  Merry Christmas  ", 50)).toBe("Merry Christmas");
    const c = capText("The best presents can't be wrapped. This is my way of saying thank you", 40);
    expect(c.endsWith("…")).toBe(true);
    expect(graphemes(c).length).toBeLessThanOrEqual(40);
    expect(c).not.toMatch(/\s…$/);
  });
  it("wraps to width, keeps line breaks, and breaks words longer than a line", () => {
    expect(wrapLines("aaa bbb ccc", 70, mono)).toEqual(["aaa bbb", "ccc"]);
    expect(wrapLines("one\n\ntwo", 100, mono)).toEqual(["one", "", "two"]);
    expect(wrapLines("x".repeat(25), 100, mono)).toEqual(["x".repeat(10), "x".repeat(10), "x".repeat(5)]);
  });
  it("clamps to a line count with an ellipsis that fits the width", () => {
    const r = clampLines(["aaaaaaaaaa", "bbbbbbbbbb", "cccccccccc"], 2, 100, mono);
    expect(r.clipped).toBe(true);
    expect(r.lines).toHaveLength(2);
    expect(mono(r.lines[1])).toBeLessThanOrEqual(100);
    expect(r.lines[1].endsWith("…")).toBe(true);
  });
  it("a 500-character message becomes a capped excerpt and is flagged so the overlay shows the full text", () => {
    const long = "Wishing you a wonderful season. ".repeat(16).slice(0, 500);
    const l = layoutWish({ name: "Anna", greeting: "A gift, just for you", message: long, sender: "Sam" }, 300, m);
    expect(l.message.length).toBeLessThanOrEqual(PANEL_MESSAGE_LINES);
    expect(l.clipped).toBe(true);
    expect(l.for).toBe("For Anna");
    expect(l.from).toBe("With love, Sam");
  });
  it("names at the 40-character limit fit on one line; HTML-like text stays plain text", () => {
    const l = layoutWish({ name: "N".repeat(40), greeting: "Hi", message: "<b>hi</b> & \"you\"", sender: "S".repeat(40) }, 200, m);
    expect(mono(l.for)).toBeLessThanOrEqual(200);
    expect(l.for.endsWith("…")).toBe(true);
    expect(l.message).toEqual(["<b>hi</b> & \"you\""]); // drawn on a canvas as characters, never parsed as markup
    expect(l.clipped).toBe(false);
  });
  it("detects right-to-left messages", () => {
    expect(isRtl("שלום וברכה")).toBe(true);
    expect(isRtl("عيد سعيد")).toBe(true);
    expect(isRtl("Hello שלום")).toBe(false);
    expect(isRtl("😀 123")).toBe(false);
  });
});

describe("AR-1b: View in AR button and card page", () => {
  it("renders nothing on the server and before support is known (no button, no layout change on unsupported phones)", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { createElement } = await import("react");
    const { ArButton } = await import("@/components/cards/ArButton");
    expect(renderToStaticMarkup(createElement(ArButton, { wish: { name: "Anna", greeting: "Hi", message: "m", sender: "Sam" }, slug: "abc123def456" }))).toBe("");
  });
  it("only the published-card page offers AR, only for A Special Gift, and the wish comes from the page's own data", async () => {
    const { readFileSync } = await import("node:fs");
    const page = readFileSync("src/app/(card)/c/[slug]/page.tsx", "utf8");
    expect(page).toMatch(/getPublishedCard\(slug\)/);
    expect(page).toMatch(/card\.templateKey === "special-gift" && \(/);
    const btn = readFileSync("src/components/cards/ArButton.tsx", "utf8");
    expect(btn).not.toMatch(/fetch\(|XMLHttpRequest|sendBeacon/); // nothing personal is uploaded
    const xr = readFileSync("src/components/cards/premium3d/ar/webxr.ts", "utf8");
    expect(xr).toMatch(/requiredFeatures: \["hit-test"\]/);
    expect(xr.indexOf("requestSession")).toBeLessThan(xr.indexOf("new THREE.WebGLRenderer")); // ask while the tap still counts as user activation
    for (const f of ["CardPlayer.tsx", "scenes.ts", "scenes.tsx"].map((n) => `src/components/cards/${n}`)) { try { expect(readFileSync(f, "utf8")).not.toMatch(/ArButton|premium3d\/ar/); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; } }
  });
});

describe("AR-1c: iPhone Quick Look", () => {
  it("builds the personal file on the phone, refreshes transforms before export, and hands Quick Look an in-memory blob", async () => {
    const { readFileSync } = await import("node:fs");
    const ql = readFileSync("src/components/cards/premium3d/ar/quicklook.ts", "utf8");
    expect(ql).not.toMatch(/fetch\(|XMLHttpRequest|sendBeacon/);
    expect(ql.match(/updateMatrixWorld\(true\)/g)?.length).toBeGreaterThanOrEqual(2); // USDZExporter writes stored matrices
    expect(ql).toMatch(/quickLookCompatible: true/);
    expect(ql).toMatch(/a\.rel = "ar"/);
    expect(ql).toMatch(/checkoutTitle: "mawica\.", checkoutSubtitle: "Send your feelings to others", callToAction: "Create your own"/); // fixed banner, no personal text
    const btn = readFileSync("src/components/cards/ArButton.tsx", "utf8");
    expect(btn).toMatch(/URL\.createObjectURL\(blob\)/);
    expect(btn).toMatch(/URL\.revokeObjectURL/);
    expect(btn).toMatch(/relList\.supports\("ar"\)/);
    expect(btn).toMatch(/setMode\(chooseArRoute\(\{ webxr: xr, quickLook: quickLook\(\)/); // order and fallbacks: tests/ar-support.test.ts
  });
  it("a shortened message on the iPhone card points to the full text on the card page", async () => {
    const { QL_NOTE } = await import("@/components/cards/premium3d/ar/quicklook");
    expect(QL_NOTE).toBe("Read the full message on your card");
  });
});

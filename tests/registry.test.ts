import { describe, expect, it } from "vitest";
import { createCardSchema } from "@/modules/cards/schema";
import { isTemplateKey, TEMPLATE_KEYS, templates } from "@/modules/templates/registry";
import { scenes } from "@/components/cards/scenes";
import { cardPreviews } from "@/content/site";

describe("template registry", () => {
  it("has exactly the six launch templates (4 Christmas, 2 New Year)", () => {
    expect([...TEMPLATE_KEYS]).toEqual(["snow-globe", "christmas-tree", "special-gift", "warm-wishes", "new-year-2027", "new-year-celebration"]);
    expect(TEMPLATE_KEYS.filter((k) => templates[k].occasion === "Christmas")).toHaveLength(4);
    expect(TEMPLATE_KEYS.filter((k) => templates[k].occasion === "New Year")).toHaveLength(2);
  });
  it("every key has template data, a scene component and a landing preview", () => {
    for (const k of TEMPLATE_KEYS) {
      expect(templates[k].key).toBe(k);
      expect(typeof scenes[k]).toBe("function");
      expect(cardPreviews.some((p) => p.id === k)).toBe(true);
      expect(isTemplateKey(k)).toBe(true);
    }
    expect(isTemplateKey("nope")).toBe(false);
  });
  it("every default message is valid input and titles are unique", () => {
    const titles = new Set<string>();
    for (const k of TEMPLATE_KEYS) {
      const t = templates[k];
      expect(createCardSchema.safeParse({ templateKey: k, recipientName: "Ava", senderName: "Sam", message: t.defaultMessage }).success).toBe(true);
      titles.add(t.title);
    }
    expect(titles.size).toBe(TEMPLATE_KEYS.length);
  });
});

import { SITE_DESCRIPTION } from "../../lib/site";
import type {
  CampaignPayload,
  CmsDocumentKey,
  FooterPayload,
  HeroPayload,
  HomeSectionsPayload,
  LegalPayload,
  NavPayload,
  SeoPayload,
} from "./schemas";

export const DOCUMENT_TITLES: Record<CmsDocumentKey, string> = {
  "home.hero": "Homepage hero",
  "home.sections": "Homepage sections",
  "site.nav": "Primary navigation",
  "site.footer": "Site footer",
  "legal.privacy": "Privacy Policy",
  "legal.terms": "Terms of Use",
  "seo.site": "Site SEO & social metadata",
  "campaign.christmas": "Christmas campaign",
  "campaign.newyear": "New Year campaign",
};

/** Mirrors `src/content/hero` + homepage copy so CMS fallbacks do not change visuals. */
export function defaultHero(): HeroPayload {
  return {
    eyebrow: "Christmas Magic 2026",
    titleLines: ["A Little Magic.", "A Lot of Love."],
    body: "Create beautiful 3D Christmas and New Year greeting cards that feel as special as the people you care about.",
    cta: "Create Your Free Card",
    annotation: ["Because", "moments like these", "matter."],
    benefits: [
      { id: "heart", label: "Free to create" },
      { id: "sparkles", label: "Beautiful 3D cards" },
      { id: "share", label: "Share instantly" },
    ],
  };
}

export function defaultHomeSections(): HomeSectionsPayload {
  return {
    galleryEyebrow: "The collection",
    galleryTitle: "Six cards, ready to be made yours",
    galleryBody:
      "Four for Christmas and two to welcome the new year. Preview images here are illustrative; open any card in the creator to see the real animation.",
    galleryChristmasHeading: "Christmas Cards",
    galleryNewYearHeading: "New Year Cards",
    howItWorksEyebrow: "How it works",
    howItWorksTitle: "Create. Personalise. Share.",
    howItWorksBody: "From idea to a card in someone's hands in three simple steps.",
    steps: [
      { n: "01", title: "Create", body: "Choose a card from our Christmas and New Year collection." },
      { n: "02", title: "Personalise", body: "Add the recipient's name, your name and a heartfelt message." },
      { n: "03", title: "Share", body: "Send it with a link, on WhatsApp, or as a QR code." },
    ],
    meetLumiEyebrow: "Your wish companion",
    meetLumiTitle: "Meet Lumi. Your Little Wish Companion.",
    meetLumiBody: "A little magic to help you make someone smile.",
    benefitsEyebrow: "Why mawica.",
    benefitsTitle: "Thoughtful, simple, and free",
    benefits: [
      { title: "Free to create", body: "Make and share a card without paying a cent." },
      { title: "Made for phones", body: "Every card is designed for the screen it will most likely be opened on." },
      { title: "Share your way", body: "One unique link that works in WhatsApp, messages, email or a QR code." },
      { title: "Personal by design", body: "Your words, their name, wrapped in a moment that feels handmade." },
    ],
    finalCtaTitle: "Bring your wishes to life.",
    finalCtaBody: "Make someone's Christmas or New Year feel a little more magical. It's free.",
    finalCtaLabel: "Create Free Card",
    recipientEyebrow: "For the person who opens it",
    recipientTitle: "A moment made for their phone",
    recipientBody:
      "Mawica is a new home for digital greetings, built around the feeling of opening something made just for you. Recipients tap a link and their card comes alive, with their name, your words and a little magic. No app to install.",
  };
}

export function defaultNav(): NavPayload {
  return {
    links: [
      { label: "Christmas Cards", href: "/#christmas" },
      { label: "New Year Cards", href: "/#new-year" },
      { label: "How It Works", href: "/#how-it-works" },
      { label: "About", href: "/#about" },
    ],
    createCta: "Create Free Card",
    searchAriaLabel: "Browse Christmas cards",
    searchHref: "/#christmas",
  };
}

export function defaultFooter(): FooterPayload {
  return {
    tagline:
      "Beautiful, personalised digital greeting cards. Starting with Christmas and New Year, for Australia, Sri Lanka and everywhere between.",
    copyright: "© 2026 mawica. All rights reserved.",
    domainLabel: "mawica.com",
    columns: [
      {
        title: "Cards",
        links: [
          { label: "Christmas Cards", href: "/#christmas" },
          { label: "New Year Cards", href: "/#new-year" },
          { label: "Create Free Card", href: "/create" },
        ],
      },
      {
        title: "Mawica",
        links: [
          { label: "How It Works", href: "/#how-it-works" },
          { label: "About", href: "/#about" },
          { label: "Sign In", href: "/sign-in" },
        ],
      },
      {
        title: "Legal",
        links: [
          { label: "Privacy Policy", href: "/privacy" },
          { label: "Terms of Use", href: "/terms" },
        ],
      },
    ],
  };
}

export function defaultLegalPrivacy(): LegalPayload {
  return {
    title: "Privacy Policy",
    updated: "5 November 2026 (draft)",
    showDraftBanner: true,
    sections: [
      {
        heading: "Who we are",
        paragraphs: [
          "mawica. (mawica.com) is operated by the Mawica team. Contact details will be confirmed before launch.",
        ],
      },
      {
        heading: "What we collect",
        paragraphs: [
          "Card content you enter, abuse-prevention hashes, optional account email, and scheduled delivery details as described in the static legal draft.",
        ],
      },
    ],
  };
}

export function defaultLegalTerms(): LegalPayload {
  return {
    title: "Terms of Use",
    updated: "5 November 2026 (draft)",
    showDraftBanner: true,
    sections: [
      {
        heading: "Using mawica.",
        paragraphs: [
          "These terms describe how you may use mawica. The full static draft remains the fallback until counsel approves published CMS text.",
        ],
      },
    ],
  };
}

export function defaultSeo(): SeoPayload {
  return {
    titleDefault: "mawica. | Bring your wishes to life",
    description: SITE_DESCRIPTION,
    ogTitle: "mawica. | Bring your wishes to life",
    ogDescription: SITE_DESCRIPTION,
    twitterTitle: "mawica. | Bring your wishes to life",
    twitterDescription: SITE_DESCRIPTION,
  };
}

/** Default campaigns are visible but inactive outside their window until staff publish overrides. */
export function defaultCampaignChristmas(): CampaignPayload {
  return {
    season: "christmas",
    anchorId: "christmas",
    title: "Christmas Cards",
    description: "Four festive cards ready to personalise and share.",
    ctaLabel: "Browse Christmas cards",
    ctaHref: "/#christmas",
    mediaAssetId: null,
    sectionVisible: true,
    startsAt: "2026-11-01T00:00:00+11:00",
    endsAt: "2026-12-26T00:00:00+11:00",
  };
}

export function defaultCampaignNewYear(): CampaignPayload {
  return {
    season: "new-year",
    anchorId: "new-year",
    title: "New Year Cards",
    description: "Welcome the year ahead with a card that feels personal.",
    ctaLabel: "Browse New Year cards",
    ctaHref: "/#new-year",
    mediaAssetId: null,
    sectionVisible: true,
    startsAt: "2026-12-20T00:00:00+11:00",
    endsAt: "2027-01-15T00:00:00+11:00",
  };
}

export function defaultPayloadFor(key: CmsDocumentKey): unknown {
  switch (key) {
    case "home.hero":
      return defaultHero();
    case "home.sections":
      return defaultHomeSections();
    case "site.nav":
      return defaultNav();
    case "site.footer":
      return defaultFooter();
    case "legal.privacy":
      return defaultLegalPrivacy();
    case "legal.terms":
      return defaultLegalTerms();
    case "seo.site":
      return defaultSeo();
    case "campaign.christmas":
      return defaultCampaignChristmas();
    case "campaign.newyear":
      return defaultCampaignNewYear();
  }
}

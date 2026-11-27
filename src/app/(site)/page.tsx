import dynamic from "next/dynamic";
import { Hero } from "@/components/landing/Hero";
import { CardPreviews } from "@/components/landing/CardPreviews";

/**
 * Hero + card grid stay in the first paint path.
 * Heavier / below-fold sections load as separate chunks so mobile first load
 * is not blocked by Meet Lumi shell, how-it-works imagery, or final CTA.
 */
const MeetLumi = dynamic(() =>
  import("@/components/landing/MeetLumi").then((m) => ({ default: m.MeetLumi })),
);
const HowItWorks = dynamic(() =>
  import("@/components/landing/HowItWorks").then((m) => ({ default: m.HowItWorks })),
);
const RecipientShowcase = dynamic(() =>
  import("@/components/landing/RecipientShowcase").then((m) => ({ default: m.RecipientShowcase })),
);
const Benefits = dynamic(() =>
  import("@/components/landing/Benefits").then((m) => ({ default: m.Benefits })),
);
const FinalCta = dynamic(() =>
  import("@/components/landing/FinalCta").then((m) => ({ default: m.FinalCta })),
);

export default function Home() {
  return (
    <>
      <Hero />
      <CardPreviews />
      <MeetLumi />
      <HowItWorks />
      <RecipientShowcase />
      <Benefits />
      <FinalCta />
    </>
  );
}

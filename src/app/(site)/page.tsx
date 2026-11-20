import { Hero } from "@/components/landing/Hero";
import { CardPreviews } from "@/components/landing/CardPreviews";
import { MeetLumi } from "@/components/landing/MeetLumi";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { RecipientShowcase } from "@/components/landing/RecipientShowcase";
import { Benefits } from "@/components/landing/Benefits";
import { FinalCta } from "@/components/landing/FinalCta";
import { resolveHeroCopy, resolveHomeSections } from "@/modules/cms/resolve";

export const instant = false;

export default async function Home() {
  const [{ data: hero }, { data: sections }] = await Promise.all([resolveHeroCopy(), resolveHomeSections()]);
  return (
    <>
      <Hero copy={hero} />
      <CardPreviews copy={sections} />
      <MeetLumi eyebrow={sections.meetLumiEyebrow} title={sections.meetLumiTitle} body={sections.meetLumiBody} />
      <HowItWorks copy={sections} />
      <RecipientShowcase copy={sections} />
      <Benefits copy={sections} />
      <FinalCta copy={sections} />
    </>
  );
}

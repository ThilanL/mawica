import { connection } from "next/server";
import { Hero } from "@/components/landing/Hero";
import { CardPreviews } from "@/components/landing/CardPreviews";
import { MeetLumi } from "@/components/landing/MeetLumi";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { RecipientShowcase } from "@/components/landing/RecipientShowcase";
import { Benefits } from "@/components/landing/Benefits";
import { FinalCta } from "@/components/landing/FinalCta";
import { resolveActiveCampaigns, resolveHeroCopy, resolveHomeSections } from "@/modules/cms/resolve";

export const instant = false;

export default async function Home() {
  // Campaign schedule uses wall-clock time — must run at request time (Cache Components).
  await connection();
  const now = new Date();
  const [{ data: hero }, { data: sections }, campaigns] = await Promise.all([
    resolveHeroCopy(),
    resolveHomeSections(),
    resolveActiveCampaigns(now),
  ]);
  return (
    <>
      <Hero copy={hero} />
      <CardPreviews
        copy={sections}
        christmasCampaign={campaigns.christmas}
        newYearCampaign={campaigns.newYear}
      />
      <MeetLumi eyebrow={sections.meetLumiEyebrow} title={sections.meetLumiTitle} body={sections.meetLumiBody} />
      <HowItWorks copy={sections} />
      <RecipientShowcase copy={sections} />
      <Benefits copy={sections} />
      <FinalCta copy={sections} />
    </>
  );
}

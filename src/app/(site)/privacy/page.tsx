import type { Metadata } from "next";
import { LegalPage, Todo } from "@/components/ui/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy | mawica.",
  description: "How mawica. handles the information in your cards and the data needed to keep the service safe.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="5 November 2026 (draft)">
      <section>
        <h2>Who we are</h2>
        <p><Todo>Legal entity name, ABN/registration, registered address</Todo> operates mawica. (mawica.com). Contact: <Todo>privacy contact email</Todo>.</p>
      </section>
      <section>
        <h2>What we collect</h2>
        <ul>
          <li><strong>Card content you enter:</strong> the recipient&rsquo;s name, your name, your message and the card design you chose. Anyone with a card&rsquo;s link can see it.</li>
          <li><strong>A scrambled network identifier:</strong> to limit abuse we keep a one-way, keyed hash of your connection&rsquo;s network address with a counter. We do not store the address itself. These records expire within about 24 hours after their window ends.</li>
          <li><strong>Reports:</strong> if someone reports a card we keep the reason, optional details, a one-way hash of their network address and the time, for up to 90 days.</li>
          <li><strong>Account details (only if you create an account):</strong> your email address (to send sign-in codes), an optional display name and time zone, a record of when you signed in and out, and a session record. We do not use passwords. <Todo>Legal review before accounts launch: retention periods, account deletion, minimum age, consent wording and the processor for sign-in emails</Todo>.</li>
          <li><strong>Server logs:</strong> our hosting provider (<Todo>confirm: Microsoft Azure</Todo>) may record standard request logs (time, page, status, network address). <Todo>Confirm log retention and region</Todo>.</li>
        </ul>
        <p>mawica. has no advertising and uses no analytics. Creating and viewing cards sets no cookies. If you sign in, we set one strictly necessary, HttpOnly session cookie that is removed when you sign out or after 14 days. <Todo>Update this section if analytics or other cookies are added</Todo>.</p>
      </section>
      <section>
        <h2>How we use it</h2>
        <ul>
          <li>To create your card, show it to people who have the link, and generate its QR code.</li>
          <li>To prevent abuse and keep the service available (rate limiting, handling reports).</li>
          <li>To meet legal obligations.</li>
        </ul>
        <p>We do not sell personal information.</p>
      </section>
      <section>
        <h2>Who can see a card</h2>
        <p>Cards are not listed or searchable and are marked so search engines should not index them. Anyone you share the link or QR code with can open it and can pass it on. Do not put sensitive information in a card.</p>
      </section>
      <section>
        <h2>Reporting and removal</h2>
        <p>Every card has a &ldquo;Report this card&rdquo; link. Reports are reviewed by us and cards that break our <a href="/terms">Terms of Use</a> are removed; a removed card stops working immediately. Because there are no accounts, creators cannot yet delete their own cards; to ask for removal of a card you made or one that contains your information, email <Todo>privacy contact email</Todo> with the card link. <Todo>Owner to decide: automatic expiry period for cards (none today) and response time for removal requests</Todo>.</p>
      </section>
      <section>
        <h2>Where data is stored and how long</h2>
        <p>Card data is stored in a database hosted in <Todo>region, e.g. Australia East</Todo>. Cards are kept until removed. <Todo>Confirm retention policy</Todo>. Abuse-prevention records and reports expire as described above.</p>
      </section>
      <section>
        <h2>Your rights</h2>
        <p>Depending on where you live (including Australia and Sri Lanka) you may have rights to access, correct or delete personal information. Contact us at <Todo>privacy contact email</Todo>. <Todo>Legal review: Privacy Act 1988 (Cth) / Sri Lanka Personal Data Protection Act applicability and any required notices</Todo>.</p>
      </section>
      <section>
        <h2>Children</h2>
        <p>mawica. is not directed at children under <Todo>13/16, per legal advice</Todo>.</p>
      </section>
      <section>
        <h2>Changes</h2>
        <p>We will update this page and its date when practices change.</p>
      </section>
    </LegalPage>
  );
}

import { heroCopy } from "@/content/hero";

function Icon({ id }: { id: (typeof heroCopy.benefits)[number]["id"] }) {
  const common = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", "aria-hidden": true as const };
  if (id === "heart") {
    return (
      <svg {...common}>
        <path d="M12 20s-7-4.35-7-9.2A3.8 3.8 0 0 1 12 7.6 3.8 3.8 0 0 1 19 10.8C19 15.65 12 20 12 20Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    );
  }
  if (id === "sparkles") {
    return (
      <svg {...common}>
        <path d="M12 3.5 13.2 8.2 18 9.5 13.2 10.8 12 15.5 10.8 10.8 6 9.5 10.8 8.2 12 3.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M18.5 14.5 19.1 16.6 21.2 17.2 19.1 17.8 18.5 19.9 17.9 17.8 15.8 17.2 17.9 16.6 18.5 14.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        <path d="M5.5 13.5 6 15.2 7.7 15.7 6 16.2 5.5 17.9 5 16.2 3.3 15.7 5 15.2 5.5 13.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="7" cy="12" r="2.4" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="16.5" cy="7.5" r="2.4" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="16.5" cy="16.5" r="2.4" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9.2 11.1 14.3 8.5M9.2 12.9 14.3 15.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function HeroBenefits() {
  return (
    <ul data-in className="mt-9 flex flex-col items-center gap-3.5 sm:mt-12 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center sm:gap-0 lg:mt-14 lg:justify-start" aria-label="Why Mawica">
      {heroCopy.benefits.map((b, i) => (
        <li
          key={b.id}
          className={`flex items-center gap-2.5 text-sm font-medium text-midnight/85 sm:px-4 md:px-5 ${i === 0 ? "sm:pl-0" : "sm:border-l sm:border-midnight/15"}`}
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/45 text-midnight shadow-[inset_0_0_0_1px_rgb(42_27_61/0.08)] backdrop-blur-sm">
            <Icon id={b.id} />
          </span>
          {b.label}
        </li>
      ))}
    </ul>
  );
}

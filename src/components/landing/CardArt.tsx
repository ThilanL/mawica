import type { CardTheme } from "@/content/site";

const backgrounds: Record<CardTheme, string> = {
  "snow-globe": "linear-gradient(160deg,#2a1b3d,#5b3d8f 70%,#9c7edb)",
  "golden-tree": "linear-gradient(160deg,#1f3a3a,#2a1b3d 80%)",
  "winter-village": "linear-gradient(160deg,#3b2a63,#9c7edb 90%)",
  starlit: "linear-gradient(160deg,#2a1b3d,#7a3d82 85%,#d969a3)",
  fireworks: "linear-gradient(160deg,#150d24,#2a1b3d 70%,#4a2f66)",
  countdown: "linear-gradient(160deg,#2a1b3d,#4a2f66 60%,#a8569a)",
};

/** Stylised preview artwork (temporary). Final per-card renders replace these. */
export function CardArt({ theme, className = "" }: { theme: CardTheme; className?: string }) {
  return (
    <div className={`relative overflow-hidden ${className}`} style={{ background: backgrounds[theme] }} aria-hidden>
      <svg viewBox="0 0 200 250" className="absolute inset-0 size-full" preserveAspectRatio="xMidYMid slice">
        <g fill="#fff8f4" opacity=".7">
          {[[30, 40], [160, 30], [120, 70], [60, 90], [180, 110], [20, 150]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={i % 2 ? 1.4 : 2} />
          ))}
        </g>
        {theme === "snow-globe" && (<><circle cx="100" cy="115" r="62" fill="#fff" fillOpacity=".08" stroke="#fff" strokeOpacity=".4" strokeWidth="2" /><path d="M100 70l-24 50h48z" fill="#2f7a63" /><circle cx="100" cy="95" r="3" fill="#f4c371" /><ellipse cx="100" cy="168" rx="46" ry="9" fill="#fff8f4" /><rect x="60" y="176" width="80" height="22" rx="6" fill="#f4c371" /></>)}
        {theme === "golden-tree" && (<><path d="M100 45l-45 80h90zM100 85l-58 85h116z" fill="#2f7a63" /><path d="M100 28l4 9 10 1-7 7 2 10-9-5-9 5 2-10-7-7 10-1z" fill="#f4c371" /><g fill="#f4c371"><circle cx="90" cy="110" r="4" /><circle cx="112" cy="140" r="4" /><circle cx="80" cy="155" r="4" /></g><rect x="94" y="170" width="12" height="20" fill="#7a5238" /></>)}
        {theme === "winter-village" && (<><path d="M0 190q100-30 200 0v60H0z" fill="#fff8f4" /><g><rect x="30" y="150" width="50" height="40" fill="#4a2f66" /><path d="M24 152l31-28 31 28z" fill="#fff8f4" /><rect x="48" y="164" width="12" height="14" fill="#f4c371" /><rect x="110" y="140" width="62" height="50" fill="#5b3d8f" /><path d="M104 142l37-32 37 32z" fill="#fff8f4" /><rect x="124" y="158" width="12" height="16" fill="#f4c371" /><rect x="148" y="158" width="12" height="16" fill="#f4c371" /></g></>)}
        {theme === "starlit" && (<><path d="M100 50c3 30 8 42 28 46-20 4-25 16-28 46-3-30-8-42-28-46 20-4 25-16 28-46z" fill="#f4c371" /><circle cx="100" cy="96" r="38" fill="#f4c371" opacity=".12" /><path d="M0 200q100-40 200 0v50H0z" fill="#2a1b3d" /></>)}
        {theme === "fireworks" && (<g strokeWidth="3" strokeLinecap="round" fill="none"><g stroke="#d969a3"><path d="M70 90v-28M70 90l20-20M70 90l28 0M70 90l20 20M70 90v28M70 90l-20 20M70 90h-28M70 90l-20-20" /></g><g stroke="#f4c371"><path d="M140 140v-22M140 140l16-16M140 140h22M140 140l16 16M140 140v22M140 140l-16 16M140 140h-22M140 140l-16-16" /></g></g>)}
        {theme === "countdown" && (<><circle cx="100" cy="110" r="52" fill="none" stroke="#f4c371" strokeWidth="3" /><path d="M100 110V78M100 110l22 14" stroke="#f4c371" strokeWidth="4" strokeLinecap="round" /><circle cx="100" cy="110" r="5" fill="#f4c371" /></>)}
      </svg>
    </div>
  );
}

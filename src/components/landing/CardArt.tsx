import type { CardTheme } from "@/content/site";

const backgrounds: Record<CardTheme, string> = {
  "snow-globe": "linear-gradient(160deg,#2a1b3d,#5b3d8f 70%,#9c7edb)",
  "christmas-tree": "linear-gradient(160deg,#1d3a3d,#12202a 75%)",
  "special-gift": "linear-gradient(160deg,#6d2b5b,#2a1b3d 80%)",
  "warm-wishes": "linear-gradient(180deg,#2b1420,#4a2230 50%,#8a4a3a)",
  "new-year-2027": "linear-gradient(160deg,#3a2250,#160c26 75%)",
  "new-year-celebration": "linear-gradient(160deg,#4a2a5f,#241238 70%)",
};

const Spark = ({ x, y, s = 8, c = "#F4C371" }: { x: number; y: number; s?: number; c?: string }) => (
  <path d={`M${x} ${y - s} L${x + s / 4} ${y - s / 4} L${x + s} ${y} L${x + s / 4} ${y + s / 4} L${x} ${y + s} L${x - s / 4} ${y + s / 4} L${x - s} ${y} L${x - s / 4} ${y - s / 4}Z`} fill={c} />
);

/** Stylised preview artwork (temporary stand-ins for final per-card renders). */
export function CardArt({ theme, className = "" }: { theme: CardTheme; className?: string }) {
  return (
    <div className={`relative overflow-hidden ${className}`} style={{ background: backgrounds[theme] }} aria-hidden>
      <svg viewBox="0 0 200 250" className="absolute inset-0 size-full" preserveAspectRatio="xMidYMid slice">
        <g fill="#fff8f4" opacity=".6">
          {[[30, 40], [160, 30], [120, 70], [60, 90], [180, 110], [20, 150]].map(([x, y], i) => (<circle key={i} cx={x} cy={y} r={i % 2 ? 1.4 : 2} />))}
        </g>
        {theme === "snow-globe" && (<><circle cx="100" cy="115" r="62" fill="#fff" fillOpacity=".08" stroke="#fff" strokeOpacity=".4" strokeWidth="2" /><path d="M100 70l-24 50h48z" fill="#2f7a63" /><circle cx="100" cy="95" r="3" fill="#f4c371" /><ellipse cx="100" cy="168" rx="46" ry="9" fill="#fff8f4" /><rect x="60" y="176" width="80" height="22" rx="6" fill="#f4c371" /></>)}
        {theme === "christmas-tree" && (<><path d="M100 40l-42 70h84zM100 80l-54 80h108zM100 126l-66 76h132z" fill="#2f7a63" /><rect x="94" y="200" width="12" height="18" fill="#7a5238" /><Spark x={100} y={30} s={12} /><g><circle cx="86" cy="104" r="4" fill="#d969a3" /><circle cx="112" cy="140" r="4" fill="#f4c371" /><circle cx="78" cy="172" r="4" fill="#9c7edb" /><circle cx="124" cy="186" r="4" fill="#d969a3" /></g></>)}
        {theme === "special-gift" && (<><ellipse cx="100" cy="132" rx="52" ry="14" fill="#f4c371" opacity=".5" /><rect x="58" y="136" width="84" height="64" rx="6" fill="#d969a3" /><rect x="94" y="136" width="12" height="64" fill="#f4c371" /><g transform="rotate(14 120 106)"><rect x="52" y="104" width="96" height="26" rx="5" fill="#e680b3" /><rect x="94" y="104" width="12" height="26" fill="#f4c371" /></g><Spark x={60} y={96} /><Spark x={150} y={84} s={6} /><Spark x={132} y={60} s={5} /></>)}
        {theme === "warm-wishes" && (<><path d="M54 214V104q0-52 46-52t46 52v110z" fill="#1b2347" stroke="#6b3a2a" strokeWidth="8" /><path d="M100 52v162M54 130h92" stroke="#6b3a2a" strokeWidth="4" /><rect x="46" y="214" width="108" height="10" rx="3" fill="#8a5238" /><circle cx="130" cy="204" r="22" fill="#ffb36b" opacity=".35" /><rect x="126" y="206" width="9" height="12" rx="2" fill="#fff3e2" /><ellipse cx="130.5" cy="202" rx="2.5" ry="5" fill="#ffb347" /><g fill="#f4c371"><circle cx="30" cy="28" r="4" /><circle cx="70" cy="36" r="4" /><circle cx="110" cy="28" r="4" /><circle cx="150" cy="36" r="4" /><circle cx="180" cy="26" r="4" /></g></>)}
        {theme === "new-year-2027" && (<><circle cx="100" cy="112" r="64" fill="none" stroke="#f4c371" strokeWidth="2.5" /><text x="100" y="126" textAnchor="middle" fontFamily="Georgia, serif" fontSize="44" fontWeight="700" fill="#f4c371">2027</text><g strokeWidth="2.5" strokeLinecap="round" fill="none"><path stroke="#d969a3" d="M40 50v-14M40 50l10-10M40 50h14M40 50l10 10M40 50v14M40 50l-10 10M40 50h-14M40 50l-10-10" /><path stroke="#f4c371" d="M160 190v-12M160 190l9-9M160 190h12M160 190l9 9M160 190v12M160 190l-9 9M160 190h-12M160 190l-9-9" /></g></>)}
        {theme === "new-year-celebration" && (<><g stroke="#f4c371" strokeOpacity=".3" strokeWidth="3">{[0, 20, 40, 60, 80, 100, 120, 140, 160, 180].map((a) => (<path key={a} d={`M100 150L${100 + 200 * Math.cos((a * Math.PI) / 180)} ${150 - 200 * Math.sin((a * Math.PI) / 180)}`} />))}</g><g transform="rotate(-14 78 190)"><path d="M62 90h32c2 38-6 62-16 74v28h14v8H64v-8h14v-28C68 152 60 128 62 90z" fill="#fff8f4" fillOpacity=".3" stroke="#fff8f4" strokeOpacity=".7" strokeWidth="2" /></g><g transform="rotate(14 122 190)"><path d="M106 90h32c2 38-6 62-16 74v28h14v8h-28v-8h14v-28C108 152 104 128 106 90z" fill="#fff8f4" fillOpacity=".3" stroke="#fff8f4" strokeOpacity=".7" strokeWidth="2" /></g><Spark x={100} y={78} s={10} /><circle cx="40" cy="40" r="3" fill="#d969a3" /><circle cx="160" cy="60" r="3" fill="#9c7edb" /><circle cx="150" cy="30" r="3" fill="#f4c371" /></>)}
      </svg>
    </div>
  );
}

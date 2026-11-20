import { Caveat, Fraunces, Plus_Jakarta_Sans } from "next/font/google";

const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"], display: "swap" });
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], display: "swap", axes: ["opsz"] });
const caveat = Caveat({ variable: "--font-caveat", subsets: ["latin"], display: "swap" });

export const fontVariables = `${jakarta.variable} ${fraunces.variable} ${caveat.variable}`;

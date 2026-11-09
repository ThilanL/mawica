"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { Component, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { usePrefersReducedMotion } from "@/lib/useMediaQuery";
import type { LumiStageHandle } from "@/components/lumi/LumiStage";
import { cleanName, NAME_MAX, sampleGreeting } from "@/components/lumi/greeting";
import { webglAvailable } from "@/components/lumi/lumiMath";

/**
 * "Meet Lumi": a guided, local-only mini experience.
 * Three.js is NOT part of the homepage bundle: the 3D stage below is a separate chunk that is only requested
 * after the visitor presses "Meet Lumi". Until then (and whenever 3D is unavailable) a static render is shown.
 * Nothing typed here leaves the component: no network request, no URL parameter, no storage, no card is created.
 */
const LumiStage = dynamic(() => import("@/components/lumi/LumiStage"), { ssr: false });

type Step = "idle" | "waking" | "ask" | "celebrating" | "reveal";

const LUMI_ALT = "Lumi, a small golden star character with a friendly smile";

/** If the lazy chunk fails to load (offline, blocked), keep the experience working with the static render. */
class ChunkBoundary extends Component<{ fallback: ReactNode; onFail: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFail(); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function LumiPreview({ pop }: { pop?: number }) {
  return (
    <div key={pop} className={`absolute inset-0 grid place-items-center ${pop ? "lumi-pop" : ""}`}>
      <Image
        src="/art/lumi/lumi-preview.webp"
        alt={LUMI_ALT}
        width={960}
        height={960}
        sizes="(min-width: 1024px) 28rem, 90vw"
        className="lumi-float w-[98%] translate-y-[5%] drop-shadow-[0_18px_30px_rgb(244_195_113/0.28)]"
      />
    </div>
  );
}

export function MeetLumi() {
  const reduced = usePrefersReducedMotion();
  const [step, setStep] = useState<Step>("idle");
  const [activated, setActivated] = useState(false);
  const [stageReady, setStageReady] = useState(false);
  const [no3d, setNo3d] = useState(false);
  const [name, setName] = useState("");
  const [pops, setPops] = useState(0);
  const stage = useRef<LumiStageHandle>(null);
  const input = useRef<HTMLInputElement>(null);
  const greeting = useRef<HTMLDivElement>(null);

  const awake = step !== "idle" && (stageReady || no3d);
  const to2d = () => { setNo3d(true); setStageReady(false); };

  // waking -> ask once Lumi is awake (a short beat so the wake-up is seen), with a safety net if 3D never loads
  useEffect(() => {
    if (step !== "waking") return;
    const t = window.setTimeout(() => setStep("ask"), awake ? (reduced ? 300 : 1100) : 9000);
    return () => window.clearTimeout(t);
  }, [step, awake, reduced]);
  useEffect(() => {
    if (step === "waking" && !awake) {
      const t = window.setTimeout(to2d, 8000);
      return () => window.clearTimeout(t);
    }
  }, [step, awake]);

  // move focus to where the visitor acts next (only after they started the experience)
  useEffect(() => { if (step === "ask") input.current?.focus(); }, [step]);
  useEffect(() => { if (step === "reveal") greeting.current?.focus(); }, [step]);

  // celebrating -> reveal
  useEffect(() => {
    if (step !== "celebrating") return;
    const t = window.setTimeout(() => setStep("reveal"), reduced ? 900 : 2000);
    return () => window.clearTimeout(t);
  }, [step, reduced]);

  const celebrate = () => { stage.current?.celebrate(); setPops((p) => p + 1); };
  const start = () => {
    // Devices without WebGL never download the 3D runtime: they get the still Lumi and the same guided flow.
    if (!webglAvailable()) setNo3d(true);
    setActivated(true);
    setStep("waking");
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setName(cleanName(name));
    setStep("celebrating");
    celebrate();
  };
  const skipName = () => { setName(""); setStep("celebrating"); celebrate(); };
  const again = () => { setName(""); setStep("ask"); };

  const g = sampleGreeting(name);
  const show3d = activated && !no3d;
  const showStatic = !show3d || !stageReady;

  return (
    <section id="meet-lumi" aria-labelledby="meet-lumi-title" className="lumi-section relative overflow-hidden text-ivory">
      <div aria-hidden className="lumi-dust pointer-events-none absolute inset-0" />
      {/* Mobile order: headline, Lumi, interaction. Desktop: Lumi left, headline + interaction right. */}
      <div className="relative mx-auto grid max-w-6xl gap-x-14 gap-y-6 px-4 py-14 sm:px-8 sm:py-24 lg:grid-cols-2 lg:gap-y-0">
        <div className="text-center lg:col-start-2 lg:row-start-1 lg:self-end lg:text-left">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-gold">Your wish companion</p>
          <h2 id="meet-lumi-title" className="mt-4 font-display text-[clamp(2.1rem,6vw,3.6rem)] leading-[1.05] tracking-tight text-balance">
            Meet Lumi. Your Little Wish Companion.
          </h2>
          <p className="mx-auto mt-4 max-w-md text-lg leading-relaxed text-ivory/85 text-pretty lg:mx-0">A little magic to help you make someone smile.</p>
        </div>

        <div className="lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <div id="lumi-stage" className="lumi-stage relative mx-auto aspect-square w-full max-w-[min(32rem,100%)]">
            <div aria-hidden className="lumi-halo absolute inset-[4%] rounded-full" />
            {showStatic && <div className={stageReady ? "pointer-events-none opacity-0 transition-opacity duration-500" : ""}><LumiPreview pop={no3d ? pops : undefined} /></div>}
            {show3d && (
              <ChunkBoundary onFail={to2d} fallback={null}>
                <LumiStage
                  handle={stage}
                  awake={awake}
                  mood={step === "ask" ? "curious" : "happy"}
                  onReady={() => setStageReady(true)}
                  onFallback={to2d}
                  fallbackSrc={null}
                />
              </ChunkBoundary>
            )}
            <p className="sr-only">{no3d ? "Lumi, shown as a still image because 3D is not available." : "Lumi, an animated golden star. You can tap Lumi to make it celebrate."}</p>
          </div>
        </div>

        <div className="mx-auto w-full max-w-md text-center lg:col-start-2 lg:row-start-2 lg:mx-0 lg:self-start lg:pt-8 lg:text-left" aria-live="polite">
          {step === "idle" && (
            <button type="button" onClick={start} aria-controls="lumi-stage" className="lumi-btn-primary">
              <svg aria-hidden viewBox="0 0 20 20" className="size-5 fill-current"><path d="M10 1.5l2.4 5.6 6.1.5-4.6 4 1.4 6-5.3-3.2L4.7 17.6l1.4-6-4.6-4 6.1-.5z" /></svg>
              Meet Lumi
            </button>
          )}
          {step === "waking" && <p role="status" className="text-lg text-ivory/90">Lumi is waking up…</p>}
          {step === "ask" && (
            <form onSubmit={submit}>
              <label htmlFor="lumi-name" className="block font-display text-2xl sm:text-3xl">Who would you like to make smile?</label>
              <p id="lumi-name-hint" className="mt-1 text-sm text-ivory/75">Optional. A first name is enough. It stays on this page.</p>
              <input
                ref={input}
                id="lumi-name"
                name="lumi-name"
                type="text"
                inputMode="text"
                autoComplete="off"
                autoCapitalize="words"
                spellCheck={false}
                maxLength={NAME_MAX}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onFocus={() => stage.current?.look(0, -0.5, 2.5)}
                aria-describedby="lumi-name-hint"
                placeholder="First name"
                className="mt-4 h-14 w-full border-0 border-b border-ivory/40 bg-transparent px-1 text-center text-xl text-ivory placeholder:text-ivory/55 focus:border-b-[3px] focus:border-gold focus-visible:outline-none lg:text-left"
              />
              <div className="mt-6 flex flex-col gap-3 sm:flex-row lg:justify-start">
                <button type="submit" className="lumi-btn-primary sm:flex-1">Make Lumi Smile</button>
                <button type="button" onClick={skipName} className="lumi-btn-secondary">Skip Name</button>
              </div>
            </form>
          )}
          {step === "celebrating" && <p role="status" className="text-lg text-ivory/90">Lumi is celebrating…</p>}
          {step === "reveal" && (
            <div ref={greeting} tabIndex={-1} className="outline-none">
              <span aria-hidden className="mx-auto block h-px w-14 bg-gold/70 lg:mx-0" />
              <p className="mt-5 font-display text-[clamp(1.9rem,6vw,2.6rem)] leading-tight break-words">{g.line}</p>
              <p className="mt-3 text-lg leading-relaxed text-ivory/90">&ldquo;{g.body}&rdquo;</p>
              <p className="mt-3 text-sm text-ivory/70">A sample. You will write your own message when you create your card.</p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Link href="/create" className="lumi-btn-primary sm:flex-1">Create Your Card</Link>
                <button type="button" onClick={again} className="lumi-btn-secondary">Try Another Name</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

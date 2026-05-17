import { AboutConfetti } from "./about-confetti";
import { AboutCta } from "./about-cta";
import { AboutFeatures } from "./about-features";
import { AboutFooter } from "./about-footer";
import { AboutHero } from "./about-hero";
import { AboutNav } from "./about-nav";
import { AboutSteps } from "./about-steps";

export function AboutPage() {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#FFFBF0]">
      <AboutConfetti />
      <AboutNav />
      <main className="relative z-[1]">
        <AboutHero />
        <AboutFeatures />
        <AboutSteps />
        <AboutCta />
        <AboutFooter />
      </main>
    </div>
  );
}

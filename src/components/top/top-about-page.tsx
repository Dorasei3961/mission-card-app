import { TopBackground } from "./top-background";
import { TopCta } from "./top-cta";
import { TopFeatures } from "./top-features";
import { TopFooter } from "./top-footer";
import { TopHero } from "./top-hero";
import { TopStats } from "./top-stats";
import { TopSteps } from "./top-steps";
import { TopUseCases } from "./top-use-cases";

/** サービス紹介LP（/about）— セッションリダイレクトなし */
export function TopAboutPage() {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#FAF7FF]">
      <TopBackground />
      <main className="relative z-10 mx-auto w-full max-w-[375px] px-5 pb-10 sm:max-w-md">
        <TopHero actionHref="/" />
        <TopFeatures />
        <TopUseCases />
        <TopSteps />
        <TopStats />
        <TopCta actionHref="/" />
        <TopFooter />
      </main>
    </div>
  );
}

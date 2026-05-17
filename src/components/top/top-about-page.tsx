import { TopCta } from "./top-cta";
import { TopFeatures } from "./top-features";
import { TopFooter } from "./top-footer";
import { TopHero } from "./top-hero";
import { TopSteps } from "./top-steps";

/** サービス紹介LP（/about）— セッションリダイレクトなし */
export function TopAboutPage() {
  return (
    <div className="min-h-screen bg-[#FAF7FF]">
      <main className="mx-auto w-full max-w-[375px] px-5 pb-8 sm:max-w-md">
        <TopHero actionHref="/" />
        <TopFeatures />
        <TopSteps />
        <TopCta actionHref="/" />
        <TopFooter />
      </main>
    </div>
  );
}

import NewNavBar from '@/sections/NewNavBar';
import NewHeroSection from '@/sections/NewHeroSection';
import NewFeaturesSection from '@/sections/NewFeaturesSection';
import NewHowItWorks from '@/sections/NewHowItWorks';
import NewTestimonialsSection from '@/sections/NewTestimonialsSection';
import NewPricingSection from '@/sections/NewPricingSection';
import NewFooterSection from '@/sections/NewFooterSection';
import { TrustedBy } from '@/components/TrustedBy';

export default function Home() {
  return (
    <main className="w-full flex flex-col">
      <div
        style={{
          background: 'linear-gradient(160deg, #a8d8e8 0%, #d4eaf5 35%, #e8f4fb 60%, #fde8d0 100%)',
        }}
      >
        <NewNavBar />
        <NewHeroSection />
      </div>
      <NewFeaturesSection />
      <NewHowItWorks />
      <TrustedBy />
      <NewTestimonialsSection />
      <NewPricingSection />
      <NewFooterSection />
    </main>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import { NavHeader } from '@/components/website/NavHeader';
import { HeroSection } from '@/components/website/Hero';
import { FeaturesSection, HowItWorksSection } from '@/components/website/Features';
import { IntegrationsSection } from '@/components/website/Integrations';
import { PricingSection, SocialProof, CTASection } from '@/components/website/Pricing';
import { SiteFooter } from '@/components/website/Footer';

export default function WebsitePage() {
  const router = useRouter();

  const goToApp = () => router.push('/login');

  const handleNav = (label: string) => {
    if (label === 'app') {
      goToApp();
      return;
    }
    const el = document.getElementById(label);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div style={{ background: '#060F1A', overflowX: 'hidden' }}>
      <NavHeader onNav={handleNav} />
      <div id="hero">
        <HeroSection onCTA={goToApp} />
      </div>
      <SocialProof />
      <div id="Features">
        <FeaturesSection />
      </div>
      <div id="How It Works">
        <HowItWorksSection />
      </div>
      <IntegrationsSection />
      <div id="Pricing">
        <PricingSection onCTA={goToApp} />
      </div>
      <CTASection onCTA={goToApp} />
      <SiteFooter />
    </div>
  );
}

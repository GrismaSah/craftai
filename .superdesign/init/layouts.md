# Layout Components

## App Shell (Root Layout)
**File**: `src/app/layout.tsx`

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CraftAI - Turn Your Ideas Into Websites",
  description: "Build and deploy stunning websites effortlessly. Describe your vision, and CraftAI creates production-ready websites in minutes. No coding required.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full w-full antialiased`}
      suppressHydrationWarning
    >
      <body className="w-full h-full flex flex-col overflow-x-hidden">{children}</body>
    </html>
  );
}
```

## Navigation Bar
**File**: `src/sections/NewNavBar.tsx`

```tsx
"use client";

import { useState, useEffect } from 'react';
import { Menu, X } from 'lucide-react';

const navLinks = [
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Features', href: '#features' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'Docs', href: '#' },
];

export default function NewNavBar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (href.startsWith('#') && href.length > 1) {
      e.preventDefault();
      const el = document.querySelector(href);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
    setMobileOpen(false);
  };

  return (
    <>
      <nav
        className={`
          fixed top-0 left-0 right-0 w-full flex items-center justify-between px-4 sm:px-6 lg:px-16 py-4 z-50 transition-all duration-300
          ${scrolled ? 'bg-white/80 backdrop-blur-xl saturate-[180%] shadow-sm' : 'bg-transparent'}
        `}
      >
        <div className="flex items-center gap-2 shrink-0">
          <span className="font-bold text-xl tracking-tight">
            <span className="text-[#111]">bl</span><span className="text-[#111]">a</span><span className="text-[#111]">ke</span>
          </span>
        </div>
        <div className="hidden md:flex items-center gap-6 lg:gap-8 text-sm text-[#444] overflow-x-auto mx-2 lg:mx-4">
          {navLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              onClick={(e) => handleNavClick(e, link.href)}
              className="whitespace-nowrap hover:text-[#f05a1a] transition-colors"
            >
              {link.label}
            </a>
          ))}
        </div>
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <a
            href="#"
            className="hidden sm:block text-sm text-[#444] hover:text-[#f05a1a] transition-colors whitespace-nowrap"
          >
            Sign in
          </a>
          <button
            onClick={() => {
              const el = document.querySelector('#hero-section');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }}
            className="bg-[#f05a1a] text-white text-sm font-medium px-4 sm:px-5 py-2 sm:py-2.5 rounded-full hover:opacity-90 transition-opacity whitespace-nowrap"
          >
            Get started free
          </button>
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-2 -mr-2"
            aria-label="Toggle menu"
          >
            {mobileOpen ? (
              <X className="w-5 h-5 text-[#111]" />
            ) : (
              <Menu className="w-5 h-5 text-[#111]" />
            )}
          </button>
        </div>
      </nav>

      {mobileOpen && (
        <div className="fixed inset-0 top-[60px] z-40 md:hidden bg-white/95 backdrop-blur-sm animate-in slide-in-from-top-2 fade-in duration-200">
          <div className="flex flex-col p-6 gap-6">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                onClick={(e) => handleNavClick(e, link.href)}
                className="text-base font-medium text-[#444] hover:text-[#111] transition-colors"
              >
                {link.label}
              </a>
            ))}
            <div className="border-t border-[#e5e5e5] pt-6">
              <button
                onClick={() => {
                  const el = document.querySelector('#hero-section');
                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                  setMobileOpen(false);
                }}
                className="w-full bg-[#f05a1a] text-white font-semibold py-3 rounded-full"
              >
                Get started free
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

## Footer
**File**: `src/sections/NewFooterSection.tsx`

```tsx
export default function NewFooterSection() {
  return (
    <footer className="border-t border-[#e5e5e5] px-6 md:px-16 py-10 bg-white">
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="font-bold text-base tracking-tight">
            <span className="text-[#111]">bl</span><span className="text-[#111]">a</span><span className="text-[#111]">ke</span>
          </span>
          <span className="text-[#888] text-xs">&copy; 2025</span>
        </div>
        <div className="flex items-center gap-8 text-sm text-[#888]">
          <a href="#" className="hover:text-[#f05a1a] transition-colors">Privacy</a>
          <a href="#" className="hover:text-[#f05a1a] transition-colors">Terms</a>
          <a href="#" className="hover:text-[#f05a1a] transition-colors">Docs</a>
          <a href="#" className="hover:text-[#f05a1a] transition-colors">Twitter / X</a>
          <a href="#" className="hover:text-[#f05a1a] transition-colors">GitHub</a>
        </div>
      </div>
    </footer>
  );
}
```

## Page Layout
**File**: `src/app/page.tsx`

```tsx
"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Home from "@/pages/home";

export default function Page() {
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    });
    lenis.on("scroll", ScrollTrigger.update);
    const rafCallback = (time: number) => { lenis.raf(time * 1000); };
    gsap.ticker.add(rafCallback);
    gsap.ticker.lagSmoothing(0);
    return () => {
      lenis.destroy();
      gsap.ticker.remove(rafCallback);
    };
  }, []);
  return <Home />;
}
```

**File**: `src/pages/home.tsx`

```tsx
import NewNavBar from '../sections/NewNavBar';
import NewHeroSection from '../sections/NewHeroSection';
import NewFeaturesSection from '../sections/NewFeaturesSection';
import NewPricingSection from '../sections/NewPricingSection';
import NewFooterSection from '../sections/NewFooterSection';
import ProcessSection from '@/sections/ProcessSection';

export default function Home() {
  return (
    <main className="w-full flex flex-col">
      <div style={{ background: 'linear-gradient(160deg, #a8d8e8 0%, #d4eaf5 35%, #e8f4fb 60%, #fde8d0 100%)' }}>
        <NewNavBar />
        <NewHeroSection />
        <NewFeaturesSection />
      </div>
      <NewPricingSection />
      <NewFooterSection />
    </main>
  );
}
```

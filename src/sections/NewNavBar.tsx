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
            <span className="text-[#111]">craftai</span>
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

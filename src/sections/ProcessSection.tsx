import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const steps = [
  {
    title: 'Prompt',
    desc: 'Describe your site in natural language. Be specific about style, layout, and content.',
  },
  {
    title: 'Generate',
    desc: 'Our AI builds your complete site — structure, design, and copy — in under a minute.',
  },
  {
    title: 'Refine',
    desc: 'Iterate with follow-up prompts. "Make the hero darker" or "Add a testimonials section."',
  },
  {
    title: 'Preview',
    desc: 'See your site live in the browser. Test interactions, responsiveness, and flow.',
  },
  {
    title: 'Export',
    desc: 'Download production-ready code. React, HTML, or Next.js — your choice.',
  },
  {
    title: 'Publish',
    desc: 'Deploy anywhere. Netlify, Vercel, or your own infrastructure.',
  },
];

export default function ProcessSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const track = trackRef.current;
    if (!section || !track) return;

    const scrollTween = gsap.to(track, {
      x: () => -(track.scrollWidth - window.innerWidth),
      ease: 'none',
      scrollTrigger: {
        trigger: section,
        start: 'top top',
        end: () => `+=${track.scrollWidth - window.innerWidth}`,
        pin: true,
        scrub: 1,
        invalidateOnRefresh: true,
      },
    });

    return () => {
      scrollTween.kill();
      ScrollTrigger.getAll().forEach((t) => t.kill());
    };
  }, []);

  return (
    <div ref={sectionRef} className="relative" style={{ height: '300vh' }}>
      <div
        className="sticky top-0 left-0 w-screen h-screen overflow-hidden"
        style={{ backgroundColor: '#fafaf9' }}
      >
        <div className="absolute top-12 left-0 right-0 text-center z-10">
          <p className="text-sm text-makr-orange font-medium tracking-widest uppercase">
            Your Site in 60 Seconds
          </p>
        </div>

        <div
          ref={trackRef}
          className="flex items-center h-full px-[10vw]"
          style={{ willChange: 'transform' }}
        >
          {steps.map((step) => (
            <div
              key={step.title}
              className="flex-shrink-0 w-[280px] md:w-[320px] mr-16 md:mr-24 last:mr-0"
            >
              <h3 className="text-xl md:text-2xl font-bold text-makr-black mb-3 tracking-tight">
                {step.title}
              </h3>
              <p className="text-sm text-makr-gray-mid leading-relaxed max-w-[280px]">
                {step.desc}
              </p>
            </div>
          ))}

          <div className="flex-shrink-0 w-[320px] md:w-[400px] bg-makr-black rounded-3xl p-8 md:p-10 relative overflow-hidden ml-16 md:ml-24">
            <div
              className="absolute inset-0 opacity-30"
              style={{
                background:
                  'radial-gradient(ellipse at 30% 80%, #7b4b3a 0%, transparent 70%)',
              }}
            />
            <div className="relative z-10">
              <h3 className="text-2xl font-bold text-white mb-3 tracking-tight">
                Your site is live
              </h3>
              <p className="text-sm text-white/60 leading-relaxed mb-8 max-w-[300px]">
                From prompt to published in 60 seconds. See your creation in action.
              </p>
              <button className="bg-makr-orange text-makr-black font-medium text-sm px-8 py-3.5 rounded-full hover:scale-[1.02] transition-transform duration-200">
                Deploy Now
              </button>
            </div>
          </div>
        </div>

        <div className="absolute bottom-20 left-[10vw] right-[10vw] h-px bg-makr-gray-light/50">
          <div
            className="h-full bg-makr-orange transition-all duration-100"
            style={{ width: '0%' }}
            ref={(el) => {
              if (!el) return;
              const updateLine = () => {
                const st = ScrollTrigger.getById('process-line');
                if (st) {
                  el.style.width = `${st.progress * 100}%`;
                }
              };
              ScrollTrigger.create({
                id: 'process-line',
                trigger: sectionRef.current,
                start: 'top top',
                end: 'bottom bottom',
                scrub: true,
                onUpdate: updateLine,
              });
            }}
          />
        </div>
      </div>
    </div>
  );
}

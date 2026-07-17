import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

/* ─── Sparkle Icon ─── */
function SparkleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2 2L12 6L7 8L5 13L2 2Z" fill="white" />
    </svg>
  );
}

/* ─── Card 1: Keyboard with Shimmer ─── */
function KeyboardCard() {
  const keys1 = ['shift', 'Z', 'X', 'C'];
  const keys2 = ['fn', 'ctrl', 'alt', '\u2318'];

  return (
    <div className="bg-makr-gray-light rounded-2xl overflow-hidden flex flex-col h-full group hover:-translate-y-1 hover:shadow-card-hover transition-all duration-300">
      {/* Illustration area */}
      <div
        className="relative flex-1 flex items-center justify-center p-6 overflow-hidden"
        style={{ backgroundColor: '#e8e8e8', minHeight: '200px' }}
      >
        {/* Shimmer overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'linear-gradient(90deg, transparent 0%, rgba(240,90,26,0.12) 50%, transparent 100%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 4s ease-in-out infinite',
          }}
        />

        <div className="flex flex-col gap-2 relative z-10">
          <div className="flex gap-2">
            {keys1.map((key) => (
              <div
                key={key}
                className="bg-makr-black text-white rounded-lg flex items-center justify-center text-xs font-medium font-mono shadow-key"
                style={
                  key === 'shift'
                    ? { padding: '12px 20px' }
                    : { width: 40, height: 40 }
                }
              >
                {key}
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            {keys2.map((key) => (
              <div
                key={key}
                className="bg-makr-black text-white rounded-lg flex items-center justify-center text-xs font-medium font-mono shadow-key"
                style={{ width: 40, height: 40 }}
              >
                {key}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="bg-[#f5f5f5] p-6">
        <h3 className="text-lg font-bold text-makr-black mb-1 tracking-tight">
          Instant generation
        </h3>
        <p className="text-sm text-makr-gray-mid leading-relaxed">
          Full websites generated in under 10 seconds. No waiting, no queues — just results.
        </p>
      </div>
    </div>
  );
}

/* ─── Card 2: Dark Card with Floating Tags ─── */
function TagsCard() {
  const tags = [
    { label: 'Design', color: '#7b4b3a', top: '20%', left: '55%' },
    { label: 'Marketing', color: '#f05a1a', top: '42%', left: '15%' },
    { label: 'Engineering', color: '#3a2d1e', top: '68%', left: '40%' },
  ];

  return (
    <div className="bg-makr-black rounded-2xl overflow-hidden flex flex-col h-full group hover:-translate-y-1 hover:shadow-card-hover transition-all duration-300">
      {/* Illustration area */}
      <div
        className="relative flex-1 p-6 overflow-hidden"
        style={{ minHeight: '200px' }}
      >
        {/* Subtle gradient */}
        <div
          className="absolute inset-0 opacity-40"
          style={{
            background:
              'radial-gradient(ellipse at 30% 60%, #4a3025 0%, transparent 70%)',
          }}
        />

        {/* Floating tags */}
        {tags.map((tag, i) => (
          <div
            key={tag.label}
            className="absolute flex items-center gap-1.5 z-10"
            style={{
              top: tag.top,
              left: tag.left,
              animation: `float 3s ease-in-out infinite`,
              animationDelay: `${i * 0.5}s`,
            }}
          >
            <div
              className="w-4 h-4 flex items-center justify-center"
              style={{
                animation: `float-slow 4s ease-in-out infinite`,
                animationDelay: `${i * 0.7}s`,
                opacity: 0.6,
              }}
            >
              <SparkleIcon />
            </div>
            <span
              className="text-white text-xs font-semibold px-3 py-1.5 rounded-full"
              style={{ backgroundColor: tag.color }}
            >
              {tag.label}
            </span>
          </div>
        ))}
      </div>

      {/* Content */}
      <div className="bg-[#0a0a0a] p-6 border-t border-[#1a1a1a]">
        <h3 className="text-lg font-bold text-makr-white mb-1 tracking-tight">
          Prompt-based editing
        </h3>
        <p className="text-sm text-makr-gray-mid leading-relaxed">
          Iterate your site with natural language. "Make the hero darker" just works.
        </p>
      </div>
    </div>
  );
}

/* ─── Card 3: Code Editor with Tilt ─── */
function CodeCard() {
  return (
    <div className="bg-makr-gray-light rounded-2xl overflow-hidden flex flex-col h-full group hover:-translate-y-1 hover:shadow-card-hover transition-all duration-300">
      {/* Illustration area */}
      <div
        className="relative flex-1 flex items-center justify-center p-6 overflow-hidden"
        style={{ minHeight: '200px' }}
      >
        {/* Code editor window */}
        <div
          className="relative w-full max-w-[260px] bg-white rounded-xl border border-[#e5e5e5] p-4 shadow-editor group-hover:shadow-lg transition-all duration-400"
          style={{
            transform: 'perspective(600px) rotateX(0deg) rotateY(0deg)',
          }}
          onMouseEnter={(e) => {
            const el = e.currentTarget;
            el.style.transform =
              'perspective(600px) rotateX(2deg) rotateY(-2deg)';
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget;
            el.style.transform =
              'perspective(600px) rotateX(0deg) rotateY(0deg)';
          }}
        >
          {/* Title bar */}
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-[#e5e5e5]" />
            <div className="w-2 h-2 rounded-full bg-[#d5d5d5]" />
            <div className="w-2 h-2 rounded-full bg-[#c5c5c5]" />
            <span className="text-[0.65rem] text-[#888] ml-2 font-mono">
              HeroSection.jsx
            </span>
          </div>

          {/* Code lines */}
          <div className="flex flex-col gap-1.5 font-mono">
            <div className="flex gap-2 items-start">
              <span className="text-[0.6rem] text-[#c0c0c0] w-4 text-right select-none">
                1
              </span>
              <span className="text-[0.7rem]">
                <span style={{ color: '#7c3aed' }}>export default </span>
                <span className="text-makr-black">function</span>
                <span style={{ color: '#f05a1a' }}> Hero</span>
                <span className="text-[#888]">()</span>
              </span>
            </div>
            <div className="flex gap-2 items-start">
              <span className="text-[0.6rem] text-[#c0c0c0] w-4 text-right select-none">
                2
              </span>
              <div className="h-2 bg-[#f0f0f0] rounded flex-1 mt-1" />
            </div>
            <div className="flex gap-2 items-start">
              <span className="text-[0.6rem] text-[#c0c0c0] w-4 text-right select-none">
                3
              </span>
              <div className="h-2 bg-[#f0f0f0] rounded w-2/3 mt-1" />
            </div>
            <div className="flex gap-2 items-start">
              <span className="text-[0.6rem] text-[#c0c0c0] w-4 text-right select-none">
                4
              </span>
              <div
                className="h-2 rounded w-1/2 mt-1"
                style={{ background: '#e0d4fb' }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="bg-[#f5f5f5] p-6">
        <h3 className="text-lg font-bold text-makr-black mb-1 tracking-tight">
          Clean code, no lock-in
        </h3>
        <p className="text-sm text-makr-gray-mid leading-relaxed">
          Export production-ready React & HTML. Your code is yours — host it anywhere.
        </p>
      </div>
    </div>
  );
}

/* ─── Main Features Section ─── */
export default function FeaturesSection() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    ScrollTrigger.refresh();
    const elements = section.querySelectorAll('.feature-animate');
    gsap.set(elements, { opacity: 0, y: 24 });
    gsap.to(elements, {
      y: 0,
      opacity: 1,
      duration: 0.7,
      stagger: 0.12,
      ease: 'power3.out',
      scrollTrigger: {
        trigger: section,
        start: 'top 85%',
      },
    });
  }, []);

  return (
    <section
      id="features"
      ref={sectionRef}
      className="w-full py-28 bg-makr-white"
    >
      <div className="max-w-6xl mx-auto px-6">
        {/* Section header */}
        <div className="text-center mb-16">
          <p className="feature-animate text-sm text-makr-orange font-medium tracking-widest uppercase mb-4">
            Features
          </p>
          <h2
            className="feature-animate text-makr-black font-medium tracking-tight"
            style={{
              fontSize: 'clamp(2.5rem, 5vw, 4rem)',
              lineHeight: 1.1,
            }}
          >
            The essentials, done right.
          </h2>
        </div>

        {/* Three-column grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="feature-animate aspect-[4/5] md:aspect-auto">
            <KeyboardCard />
          </div>
          <div className="feature-animate aspect-[4/5] md:aspect-auto">
            <TagsCard />
          </div>
          <div className="feature-animate aspect-[4/5] md:aspect-auto">
            <CodeCard />
          </div>
        </div>
      </div>
    </section>
  );
}

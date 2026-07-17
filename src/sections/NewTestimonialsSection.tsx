import { Star } from 'lucide-react';

const testimonials = [
  {
    name: 'John Doe',
    role: 'CTO @ TechFlow',
    image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop&crop=face',
    quote: 'The code quality exported by CraftAI is genuinely production-ready. It saved our front-end team weeks of boilerplate work.',
  },
  {
    name: 'Sarah Kim',
    role: 'Senior Dev @ Cloudscale',
    image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&h=80&fit=crop&crop=face',
    quote: 'I was skeptical about AI builders, but the prompt-to-React workflow in CraftAI is absolute magic for rapid prototyping.',
  },
  {
    name: 'Marcus Lee',
    role: 'Head of Design @ Vertex',
    image: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=80&h=80&fit=crop&crop=face',
    quote: 'The ability to edit via natural language is a game changer for non-technical stakeholders to contribute without breaking things.',
  },
  {
    name: 'Alex Rivera',
    role: 'Freelance Engineer',
    image: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=80&h=80&fit=crop&crop=face',
    quote: 'CraftAI is my secret weapon. I can deliver 3x more projects per month without sacrificing customizability or performance.',
  },
  {
    name: 'Taylor Wong',
    role: 'Lead Developer @ Nova',
    image: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=80&h=80&fit=crop&crop=face',
    quote: 'The React components it generates are clean, scoped, and follow modern best practices. Unbelievable precision.',
  },
  {
    name: 'Rachel Jin',
    role: 'Engineering Manager @ Pulse',
    image: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=80&h=80&fit=crop&crop=face',
    quote: 'CraftAI cut our onboarding site delivery from 2 weeks to 2 hours. The team was blown away by the first generated result.',
  },
];

export default function NewTestimonialsSection() {
  return (
    <section id="testimonials" className="w-full py-28 bg-white overflow-hidden">
      <div className="max-w-6xl mx-auto px-6 flex flex-col lg:flex-row items-center gap-16">
        <div className="lg:w-1/2 text-left">
          <p className="text-sm text-[#f05a1a] font-medium tracking-widest uppercase mb-4">
            Testimonials
          </p>
          <h2
            className="text-[#26251e] font-medium tracking-tight mb-6"
            style={{ fontSize: 'clamp(2rem, 4vw, 3.5rem)', lineHeight: 1.1 }}
          >
            Loved by Engineering Teams
          </h2>
          <p className="text-lg text-[#5a5852] leading-relaxed">
            See what developers and engineering leaders are saying about AI-powered website builder{' '}
            <span className="font-bold text-[#26251e]">craftai</span>.
          </p>
          <div className="mt-10 flex items-center gap-4">
            <div className="flex -space-x-3">
              {testimonials.slice(0, 4).map((t) => (
                <img
                  key={t.name}
                  src={t.image}
                  alt={t.name}
                  className="w-10 h-10 rounded-full border-2 border-white object-cover"
                />
              ))}
            </div>
            <p className="text-sm text-[#5a5852] font-medium">
              Joined by <span className="text-[#26251e] font-bold">2,500+</span> engineers
            </p>
          </div>
        </div>

        <div className="lg:w-1/2 relative h-[560px] w-full">
          <div className="absolute top-0 left-0 right-0 h-40 bg-gradient-to-b from-white via-white/80 to-transparent z-20 pointer-events-none" />
          <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-white via-white/80 to-transparent z-20 pointer-events-none" />

          <div className="h-full overflow-hidden relative">
            <div className="flex flex-col gap-6 animate-vertical-ticker">
              <div className="flex flex-col gap-6">
                {testimonials.map((t) => (
                  <div
                    key={t.name}
                    className="bg-white p-6 rounded-2xl border border-gray-100 shadow-[0_4px_24px_rgba(0,0,0,0.06)] hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)] transition-shadow"
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <img
                        src={t.image}
                        alt={t.name}
                        className="w-10 h-10 rounded-full object-cover"
                      />
                      <div>
                        <h4 className="text-sm font-bold text-[#26251e]">{t.name}</h4>
                        <p className="text-xs text-[#807d72]">{t.role}</p>
                      </div>
                      <div className="ml-auto flex text-[#FFB800]">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} className="w-3 h-3 fill-current" />
                        ))}
                      </div>
                    </div>
                    <p className="text-sm text-[#5a5852] italic leading-relaxed">
                      &ldquo;{t.quote}&rdquo;
                    </p>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-6" aria-hidden>
                {testimonials.map((t) => (
                  <div
                    key={t.name}
                    className="bg-white p-6 rounded-2xl border border-gray-100 shadow-[0_4px_24px_rgba(0,0,0,0.06)] hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)] transition-shadow"
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <img
                        src={t.image}
                        alt={t.name}
                        className="w-10 h-10 rounded-full object-cover"
                      />
                      <div>
                        <h4 className="text-sm font-bold text-[#26251e]">{t.name}</h4>
                        <p className="text-xs text-[#807d72]">{t.role}</p>
                      </div>
                      <div className="ml-auto flex text-[#FFB800]">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} className="w-3 h-3 fill-current" />
                        ))}
                      </div>
                    </div>
                    <p className="text-sm text-[#5a5852] italic leading-relaxed">
                      &ldquo;{t.quote}&rdquo;
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

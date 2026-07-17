'use client'

const companies = [
  { name: 'Stripe', logo: 'https://cdn.simpleicons.org/stripe' },
  { name: 'Notion', logo: 'https://cdn.simpleicons.org/notion' },
  { name: 'Figma', logo: 'https://cdn.simpleicons.org/figma' },
  { name: 'Vercel', logo: 'https://cdn.simpleicons.org/vercel' },
  { name: 'Supabase', logo: 'https://cdn.simpleicons.org/supabase' },
  { name: 'Linear', logo: 'https://cdn.simpleicons.org/linear' },
  { name: 'PlanetScale', logo: 'https://cdn.simpleicons.org/planetscale' },
  { name: 'Sentry', logo: 'https://cdn.simpleicons.org/sentry' },
  { name: 'Railway', logo: 'https://cdn.simpleicons.org/railway' },
  { name: 'Calendly', logo: 'https://cdn.simpleicons.org/calendly' },
  { name: 'Loom', logo: 'https://cdn.simpleicons.org/loom' },
  { name: 'DigitalOcean', logo: 'https://cdn.simpleicons.org/digitalocean' },
]

export function TrustedBy() {
  return (
    <section className="relative w-full bg-white py-20 md:py-24">
      {/* Header */}
      <div className="mb-12 text-center">
        <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">Trusted by</p>
        <h2 className="mt-2 font-semibold text-[#26251e] tracking-tight" style={{ fontSize: 'clamp(1.75rem, 3.5vw, 3rem)', lineHeight: 1.1 }}>Startups building in public</h2>
      </div>

      {/* Scrolling Container */}
      <div className="relative overflow-hidden bg-white">
        {/* Gradient overlays */}
        <div className="pointer-events-none absolute left-0 top-0 z-10 h-full w-32 bg-gradient-to-r from-white to-transparent" />
        <div className="pointer-events-none absolute right-0 top-0 z-10 h-full w-32 bg-gradient-to-l from-white to-transparent" />

        {/* Scrolling logos */}
        <div className="flex animate-scroll-logos-left gap-12 px-8">
          {/* First set of logos */}
          {companies.map((company) => (
            <div
              key={`${company.name}-1`}
              className="flex min-w-max items-center justify-center"
            >
              <img
                src={company.logo}
                alt={company.name}
                width={140}
                height={56}
                className="h-14 w-auto object-contain grayscale transition-all duration-300 hover:grayscale-0 hover:scale-110"
              />
            </div>
          ))}

          {/* Duplicate set for seamless loop */}
          {companies.map((company) => (
            <div
              key={`${company.name}-2`}
              className="flex min-w-max items-center justify-center"
            >
              <img
                src={company.logo}
                alt={company.name}
                width={140}
                height={56}
                className="h-14 w-auto object-contain grayscale transition-all duration-300 hover:grayscale-0 hover:scale-110"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

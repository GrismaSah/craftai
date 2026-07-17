import { Check } from 'lucide-react';

const plans = [
  {
    name: 'Hobby',
    price: 'Free',
    period: 'Forever',
    description: 'For tinkerers and side projects.',
    features: ['5 sites', 'Basic components', 'Community support', 'craftai.app subdomain'],
    cta: 'Start for free',
    highlighted: false,
  },
  {
    name: 'Pro',
    price: '$19',
    period: '/ month',
    description: 'For indie hackers shipping real products.',
    features: [
      'Unlimited sites',
      'Full component library',
      'Custom domains',
      'Priority generation',
      'Export clean code',
      'Email support',
    ],
    cta: 'Get Pro',
    highlighted: true,
    badge: 'Most popular',
  },
  {
    name: 'Team',
    price: '$49',
    period: '/ month',
    description: 'For small teams building together.',
    features: [
      'Everything in Pro',
      '5 team seats',
      'Shared projects',
      'API access',
      'Slack support',
    ],
    cta: 'Start team trial',
    highlighted: false,
  },
];

export default function NewPricingSection() {
  return (
    <section id="pricing" className="px-6 md:px-16 py-24 bg-white">
      <div className="max-w-5xl mx-auto">
        <div className="mb-16 text-center">
          <p className="text-xs text-[#f05a1a] uppercase tracking-widest font-medium mb-3">
            Pricing
          </p>
          <h2 className="text-4xl font-bold text-[#111] tracking-tight">
            Simple, honest pricing
          </h2>
          <p className="text-[#888] text-base mt-4">
            No surprise charges. Upgrade or downgrade anytime.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-2xl border p-8 flex flex-col gap-6 ${
                plan.highlighted
                  ? 'border-[#f05a1a] bg-[#111]'
                  : 'border-[#e5e5e5] bg-[#f0f0f0]'
              }`}
            >
              {plan.badge && (
                <span className="self-start text-xs bg-[#f05a1a] text-white px-3 py-1 rounded-full font-medium">
                  {plan.badge}
                </span>
              )}
              <div>
                <p className={`text-sm mb-1 ${plan.highlighted ? 'text-white/60' : 'text-[#888]'}`}>
                  {plan.name}
                </p>
                <div className="flex items-baseline gap-1">
                  <span
                    className={`text-4xl font-bold ${
                      plan.highlighted ? 'text-white' : 'text-[#111]'
                    }`}
                  >
                    {plan.price}
                  </span>
                  <span className={`text-sm ${plan.highlighted ? 'text-white/60' : 'text-[#888]'}`}>
                    {plan.period}
                  </span>
                </div>
                <p className={`text-sm mt-2 ${plan.highlighted ? 'text-white/70' : 'text-[#888]'}`}>
                  {plan.description}
                </p>
              </div>
              <ul className="flex flex-col gap-2.5">
                {plan.features.map((feature) => (
                  <li
                    key={feature}
                    className={`flex items-center gap-2 text-sm ${
                      plan.highlighted ? 'text-white' : 'text-[#111]'
                    }`}
                  >
                    <Check className="w-3.5 h-3.5 flex-shrink-0" style={{ color: plan.highlighted ? '#f05a1a' : '#f05a1a' }} />
                    {feature}
                  </li>
                ))}
              </ul>
              <button
                className={`mt-auto w-full py-3 rounded-full text-sm font-semibold transition-all hover:scale-[1.02] ${
                  plan.highlighted
                    ? 'bg-[#f05a1a] text-white'
                    : 'bg-white text-[#111] border border-[#e5e5e5] hover:border-[#f05a1a]/30 hover:text-[#f05a1a] hover:bg-[#fef3ed]'
                }`}
              >
                {plan.cta}
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

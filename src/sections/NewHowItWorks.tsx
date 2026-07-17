import { Terminal, Cpu, Rocket } from 'lucide-react';

const accentColors = ['#f05a1a', '#7c3aed', '#0891b2'];
const iconBgs = ['bg-[#fef3ed]', 'bg-[#f0eaff]', 'bg-[#ecfeff]'];

const steps = [
  {
    icon: Terminal,
    number: '01',
    title: 'Describe your site',
    description:
      'Type a prompt describing what you want — your niche, features, and feel. No design skills needed.',
  },
  {
    icon: Cpu,
    number: '02',
    title: 'CraftAI generates it',
    description:
      'Our AI builds the full site — structure, copy, styles, and components — in seconds.',
  },
  {
    icon: Rocket,
    number: '03',
    title: 'Edit & deploy',
    description:
      'Tweak with follow-up prompts or export clean code. Deploy to your domain with one click.',
  },
];

export default function NewHowItWorks() {
  return (
    <section id="how-it-works" className="px-6 md:px-16 py-24 bg-white">
      <div className="max-w-5xl mx-auto">
        <div className="mb-16 text-center">
          <p className="text-xs text-[#f05a1a] uppercase tracking-widest font-medium mb-3">
            How it works
          </p>
          <h2 className="text-4xl font-bold text-[#111] tracking-tight">
            From idea to live in minutes
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {steps.map((step, i) => (
            <div key={step.number} className={`bg-[#f0f0f0] rounded-2xl p-8 flex flex-col gap-4 relative overflow-hidden`}>
              <div
                className="absolute top-0 left-0 right-0 h-1"
                style={{ background: accentColors[i] }}
              />
              <div className="flex items-center justify-between">
                <div className={`w-10 h-10 rounded-xl ${iconBgs[i]} flex items-center justify-center border border-[#e5e5e5]`}
                  style={{ color: accentColors[i] }}
                >
                  <step.icon className="w-4 h-4" />
                </div>
                <span className="text-3xl font-bold" style={{ color: accentColors[i] + '20' }}>{step.number}</span>
              </div>
              <h3 className="text-base font-semibold text-[#111]">{step.title}</h3>
              <p className="text-sm text-[#888] leading-relaxed">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

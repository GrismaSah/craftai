# CraftAI Design System

## Product Context

**CraftAI** is an AI-powered website builder that allows users to generate production-ready websites from natural language prompts. It converts text descriptions into fully functional React/TypeScript/Tailwind CSS websites.

### Key Features
- Instant website generation from prompts
- Clean, production-ready code export
- Smart AI-powered theming
- Responsive design by default
- One-click deployment
- 40+ pre-built component library
- Version control and deployment

### Key Pages/Flows
- **Landing Page**: Hero section with prompt input, features grid, how it works, live preview, pricing, testimonials
- **Builder Page**: Where users can create and edit websites
- **Test Page**: Testing environment

## Design Direction

The current design uses a **warm, professional, and modern** aesthetic with:
- Warm color palette (Orange, Lime, Cream)
- Clean typography and spacing
- Smooth animations (Lenis scroll, GSAP animations)
- Card-based layouts
- Minimal, accessible design

### For Enhancement:
- **Remove AI generic icons** - Replace Lucide icons with custom-designed, more distinctive visuals
- **Increase modern appeal** - Use contemporary design patterns: glassmorphism, bold typography, unique layouts
- **Maintain warmth** - Keep the warm orange/cream palette but elevate it
- **Add distinction** - Make UI elements more memorable and branded

## Design Tokens

### Color Palette

#### Primary Colors
- **Brand Orange**: `#f54e00` - Primary action, brand color
- **Brand Orange Active**: `#d04200` - Hover/active states
- **Accent Lime**: `#C8E636` - Highlights, CTAs
- **Accent Lime Hover**: `#B5D42F` - Hover state

#### Neutral Colors
- **Ink (Text Primary)**: `#26251e`
- **Body (Text Secondary)**: `#5a5852`
- **Muted**: `#807d72`
- **Muted Soft**: `#a09c92`
- **Hairline (Borders)**: `#e6e5e0`
- **Canvas (Background)**: `#f7f7f4`
- **Canvas Soft**: `#fafaf7`
- **Surface (Cards)**: `#ffffff`
- **Cream**: `#FFFBF0`

#### Semantic Colors
- **Success**: `#10B981`
- **Gold/Warning**: `#FFB800`
- **Code Background**: `#1E1E1E`
- **Code Surface**: `#F4F0E8`

### Typography

#### Font Families
- **Sans (Default)**: system-ui, -apple-system, Segoe UI, Roboto, Oxygen, Ubuntu, Cantarell, sans-serif
- **Mono (Code)**: JetBrains Mono, Fira Code, monospace

#### Type Scale
- **h1 (Hero)**: text-4xl md:text-6xl lg:text-[80px] - Bold headlines
- **h2 (Section)**: text-3xl md:text-4xl - Section headings
- **h3 (Subsection)**: text-2xl md:text-3xl - Subsection headings
- **body**: text-base md:text-lg - Default body text
- **body-small**: text-sm - Secondary text
- **caption**: text-xs - Captions and labels

#### Text Styles
- **Bold/Strong**: font-semibold, font-bold
- **Medium**: font-medium
- **Regular**: font-normal

### Spacing Scale

All spacing follows 4px base unit:
- `4px` (1 unit)
- `8px` (2 units)
- `12px` (3 units)
- `16px` (4 units)
- `20px` (5 units)
- `24px` (6 units)
- `32px` (8 units)
- `48px` (12 units)
- `64px` (16 units)
- `80px` (20 units)

#### Section Padding
- Mobile: `px-5 py-16`
- Desktop: `px-10 py-20 md:py-32 lg:py-40`

#### Component Gaps
- Default: `gap-4` to `gap-8`
- Large sections: `gap-12` to `gap-16`

### Border Radius

- **Input fields**: `0.875rem` (14px)
- **Buttons**: `0.75rem` (12px)
- **Cards**: `1rem` (16px)
- **Large elements**: `1.5rem` (24px)

### Shadows

- **Default (Cards)**: `shadow-[0_4px_24px_rgba(0,0,0,0.08)]`
- **Hover (Cards)**: `shadow-[0_12px_40px_rgba(0,0,0,0.08)]`
- **Focus**: `shadow-[0_0_0_4px_rgba(200,230,54,0.15),0_4px_24px_rgba(0,0,0,0.12)]`
- **Elevation**: `shadow-xl`

### Animations & Motion

#### Durations
- Quick interactions: `duration-200`
- Medium transitions: `duration-300`
- Longer animations: `duration-500` to `duration-700`

#### Easing
- Smooth transitions: `ease-in-out`
- Entrance animations: `cubic-bezier(0.34, 1.56, 0.64, 1)` (bounce)

#### Named Animations
- **Shimmer**: 2s infinite opacity pulse
- **Gradient Shift**: 15s ease infinite
- **Caret Blink**: 1s ease-in-out infinite
- **Scroll**: 30s linear infinite

### Component Styles

#### Buttons

**Primary (CTA)**
- Background: Lime (#C8E636)
- Text: Ink (#26251e)
- Padding: `px-6 py-2.5`
- Border Radius: `0.75rem`
- Hover: Background darkens to `#B5D42F`, slight scale up `hover:scale-[1.02]`
- Font: `font-semibold text-sm`

**Secondary**
- Background: Transparent with border
- Border: `border-card-border`
- Text: Ink or Body text
- Hover: Darker border, subtle shadow

#### Cards

**Feature Card**
- Background: White (`#ffffff`)
- Border: `border-card-border` (rgba(0,0,0,0.05))
- Border Radius: `1rem`
- Padding: `p-8`
- Icon: Background `lime/12`, lime text, size `w-[22px] h-[22px]`
- Hover: Border darkens, lift animation (`-translate-y-1`), shadow increases

**Pricing Card**
- Similar to feature card
- Includes feature list, CTA button
- May have highlight state for recommended plan

#### Inputs

**Prompt Input**
- Border Radius: `0.875rem`
- Placeholder: `color #a09c92`, fade animation
- Focus: Lime accent, focus shadow
- Clear button available for entered text

### Layout Patterns

#### Container
- **Max width**: `max-w-6xl` (section standard), `max-w-4xl` (narrow), `max-w-3xl` (very narrow)
- **Padding**: Responsive (5px mobile, 10px desktop)
- **Center**: `mx-auto`

#### Grid Layouts
- **Features Grid**: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6`
- **Testimonial Grid**: `grid-cols-1 md:grid-cols-2 gap-8`
- **Pricing Grid**: `grid-cols-1 md:grid-cols-3 gap-6`

#### Navigation
- **Fixed top**: `fixed top-0 left-0 right-0 z-50 h-20`
- **Glass effect**: `backdrop-blur-[20px] saturate-[180%]`
- **Links**: Text-sm, medium weight, hover color change

### Global Styles

#### Background Colors by Section
- **Hero/Default**: Canvas (`#f7f7f4`)
- **Features**: Cream (`#FFFBF0`)
- **Alternating**: Canvas and Cream alternate

#### Typography Hierarchy
- Headlines: Serif-like bold display
- Body: System font, medium weight, good contrast
- Secondary: Muted colors, smaller size

#### Focus & Accessibility
- Focus ring: Lime accent color
- Min touch target: 44x44px
- Color contrast: WCAG AA compliant

### Component Extraction Rules

**Extractable layout components:**
- Navigation bar (top fixed nav)
- Footer
- Section containers with headers

**Keep as primitives:**
- Button (too simple, used inline)
- Input (too simple, used inline)
- Text elements (keep inline)

## Design System Constraints

### DO
- ✅ Use only colors from the defined palette
- ✅ Use typography from the type scale
- ✅ Maintain spacing rhythm using 4px base unit
- ✅ Apply hover states and interactions
- ✅ Keep animations smooth and purposeful
- ✅ Use custom icons/visuals instead of generic library icons
- ✅ Maintain warm, modern aesthetic
- ✅ Keep animations under 300-500ms for snappy feel

### DON'T
- ❌ Introduce new colors outside the palette
- ❌ Use serif fonts except for headlines
- ❌ Break spacing rhythm with arbitrary values
- ❌ Use generic Lucide/react-icons without customization
- ❌ Add heavy animations or effects
- ❌ Change the core brand colors

## Design Inspiration

**Style Direction:**
- Contemporary SaaS design (minimal, clean, purposeful)
- Modern web typography (bold headlines, clean hierarchy)
- Distinctive visual language (custom elements, unique patterns)
- Warm and inviting color usage
- Smooth, intentional animations
- Card-based and grid-based layouts
- Accessible and responsive design

**Reference aesthetic:**
- Bold, playful typography
- Generous whitespace
- Subtle depth (shadows, layering)
- Smooth micro-interactions
- Custom iconography or unique visual treatments
- Premium feel while remaining approachable

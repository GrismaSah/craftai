# Extractable Components

## Layout Components

### NavBar
- Source: `src/sections/NewNavBar.tsx`
- Category: layout
- Description: Fixed top navigation with logo, nav links (How it works, Features, Pricing, Docs), sign in link, and CTA button. Glass effect on scroll. Mobile hamburger menu overlay.
- Extractable props: activeItem (string, default: "home"), showGetStarted (boolean, default: true)
- Hardcoded: Logo text ("craftai"), nav link labels, all styling/colors, mobile menu

### Footer
- Source: `src/sections/NewFooterSection.tsx`
- Category: layout
- Description: Footer with logo, copyright, and links (Privacy, Terms, Docs, Twitter/X, GitHub)
- Extractable props: (none — fully hardcoded)
- Hardcoded: Logo, all link labels, styling

### FeatureCard (generic)
- Source: `src/sections/NewFeaturesSection.tsx`
- Category: basic
- Description: Feature card with illustration area and content area. Used in the 3-column features grid.
- Extractable props: title (string, default: "Feature"), description (string, default: ""), illustrationVariant (string, default: "keyboard")
- Hardcoded: Card styling, icon SVGs, layout structure

## Basic Components
None — all UI primitives are simple inline Tailwind components.

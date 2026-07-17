# Page Dependency Trees

## `/` (Home/Landing Page)
Entry: `src/app/page.tsx`
Dependencies:
- `src/pages/home.tsx`
  - `src/sections/NewNavBar.tsx`
  - `src/sections/NewHeroSection.tsx`
  - `src/sections/NewFeaturesSection.tsx`
  - `src/sections/NewPricingSection.tsx`
  - `src/sections/NewFooterSection.tsx`
  - `src/sections/ProcessSection.tsx`
- `src/app/globals.css`

## `/builder` (Builder Page)
Entry: `src/app/builder/page.tsx`
Dependencies:
- `src/app/globals.css`

# Image2 Website Experience Contract

## Product

- **Scope:** `/` public entrance and its handoff into `/image2-cases`.
- **Audience:** Chinese AI image/video creators who need reproducible visual references, not casual prompt entertainment.
- **Primary goal:** Move a visitor from visual recognition to one useful case inspection.
- **Primary CTA:** Open case library; success evidence is a valid case-detail navigation.
- **Stack/source:** Existing Next.js repository and project-owned Image2 case data/assets.

## Visual direction

- **Design read:** Product-led creator SaaS with an editorial case-library voice, using the existing dark Image2 workspace as the product identity.
- **Dials:** variance 7, motion 3, density 5.
- **First impression:** Serious, useful, image-led, and built for repeated creator work.
- **Visual protagonist:** Real case collage, approximately 50% of the desktop first screen and 35% on mobile.
- **Secondary information:** One product statement, one supporting sentence, one primary and two secondary actions.
- **Typography/material:** Strong system Chinese sans, warm off-white foreground, near-black canvas, emerald/mint operational accent, thin cool-gray borders, solid surfaces rather than broad glass effects.
- **Image role:** Proof and navigation. Images are never decorative wallpaper.

## Information hierarchy

| Section | User question | Primary content | CTA/state | Priority |
| --- | --- | --- | --- | --- |
| Navigation | Where am I and where can I go? | Brand, case library, workbench, video, language, account | Direct route/account modal | High |
| Hero | What practical job does Image2 do? | Reuse promise plus live cases | Open case library | Highest |
| Curated proof | Are the cases useful and traceable? | Six real cases with compact prompt summaries | Open one case | High |
| Workflow handoff | What can I do after finding a case? | Search/deconstruct and save/adapt paths | Case library/workbench | Medium |

## Motion budget

- **Level:** Light.
- **Purpose:** Reveal reading order and provide local hover/focus feedback only.
- **Technique:** CSS opacity/translate entrance and image scale on pointer hover; no GSAP dependency.
- **Mobile:** No hover dependency; entrance durations shortened.
- **Reduced motion:** All transitions and entrance transforms disabled through `prefers-reduced-motion`.

## Motion inventory

| Area | Purpose | Trigger | Initial -> end | Duration | Technique | Fallback |
| --- | --- | --- | --- | --- | --- | --- |
| Hero copy/collage | Reading order | Initial load | 8px lower/transparent -> settled/opaque | 320-520ms | CSS keyframes | Final state immediately |
| Case image | Signal clickability | Hover/focus | scale 1 -> 1.025 | 180ms | CSS transform | Border/focus state only |
| Buttons | Confirm interaction | Hover/focus/active | color/border/1px translate | 120-180ms | CSS transition | Native focus outline |

## Asset registry

| Asset | State | Format | Use | Source/rights | Fallback |
| --- | --- | --- | --- | --- | --- |
| Six local hero case images | Existing | JPG | Failed remote image fallback and first-screen proof | Project-owned cached case media | Solid labeled tile |
| Featured case remote media | Existing | Remote image through allowlisted proxy | Curated proof cards | Source attribution in case data | Deterministic local hero image |
| Lucide interface icons | Existing dependency | SVG component | Navigation/actions | Package dependency | Text label |

## Performance and accessibility

- Target 390px mobile and 1440px desktop on ordinary 4G/broadband.
- First hero image eager; remaining images lazy. Remote images use the existing allowlisted same-origin proxy and deterministic local fallback.
- No more than four hero images in the first viewport.
- Buttons/links remain real elements with focus-visible states; no information depends on hover or animation.
- No animation lifecycle resources beyond CSS.

## Verification

- Desktop: 1440x1000 and 768x1024 screenshot and path checks.
- Mobile: 390x844 and 320x700 screenshot and overflow checks.
- Reduced motion: computed media route or screenshot check.
- Interaction: case link, login modal, language toggle, keyboard focus.
- Verified claims stay separate from pending production URL checks.

# build

Landing page for **build**: first-person video of real people doing real work, recorded on a capture cap.

A single static page with a WebGL scene behind the content:

- **Hero orb**: a dot-grid sphere folded by noise, coloured by viewing angle (orange rim, magenta, violet core). It reacts to the pointer.
- **The cap**: the orb's points re-form into the capture cap, then a solid 3D cap takes over and comes apart into its parts as you scroll.
- **Promises**: a figure made of light, with rays falling into an open hand.
- **Footer**: the points settle into the "build" wordmark.

Built with Vite, TypeScript, [Three.js](https://threejs.org), [GSAP](https://gsap.com) and [Lenis](https://lenis.darkroom.engineering).

## Run it

Needs Node 18 or newer (Vite 6).

```bash
npm install
npm run dev       # local dev server
npm run build     # type-check and build to dist/
npm run preview   # serve the production build
```

`dist/` is plain static files. Any static host works (Vercel, Netlify, GitHub Pages), and asset paths are relative.

## Edit

| What | Where |
|---|---|
| Copy and sections | `index.html` |
| Take-part and contact links | `src/config.ts` |
| Colours, type, spacing | `src/styles/tokens.css` |
| Orb look (noise, colours, dot size) | `src/three/orb.ts` |
| Capture cap model | `src/three/cap.ts` |
| Light figure | `src/three/figure.ts` |
| Scroll choreography | `src/three/choreography.ts` |

## Behaviour

- **Quality tiers.** Phones get fewer points and no bloom. The page steps down further if frames run slow.
- **Reduced motion.** `prefers-reduced-motion` turns off smooth scrolling and slows the scene. The round button in the nav pauses all animation.
- **No WebGL.** A CSS dotted orb stands in, and every section still reads.

## Content

The page carries the public summary of the project only. Internal collection rules, quotas and logistics stay out, and so do invented numbers. PDFs are git-ignored so internal documents can't be committed by accident.

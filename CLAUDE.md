# Community Project

Lukas is a designer first, not a developer. He has a basic understanding of JavaScript but does not write code daily. When explaining things or writing code, keep it accessible — avoid heavy jargon, and when something non-obvious is happening, say so in plain English.

## Context

- Code runs as custom JavaScript inside **Webflow** sites
- Animations are done with **GSAP** (GreenSock)
- The live dev setup uses **fxtun** to tunnel a local server (port 5500) to `https://astralis.fxtun.dev`
- Production code is served from **jsDelivr** via the GitHub repo

## Code Style
- Use `const`/`let`, never `var`
- Single quotes for strings
- No semicolons unless necessary
- Keep functions small and focused
- Prefer descriptive variable names over abbreviations

## GSAP Rules
- Always wrap GSAP code in `document.addEventListener('DOMContentLoaded', () => { ... })` unless there's a specific reason not to
- Use `gsap.registerPlugin(...)` at the top before any animations
- Prefer `gsap.from()` for entrance animations, `gsap.to()` for exits/transitions
- Use `ScrollTrigger` for scroll-based animations — always pair it with `ScrollTrigger.refresh()` after layout changes
- Keep easing human-readable: `power2.out`, `back.out(1.7)` — avoid raw cubic bezier strings unless necessary
- Never hardcode pixel values that should respond to screen size — use `%`, `vw`, `vh`, or `gsap.matchMedia()`
- Group related animations into named timelines (`const tl = gsap.timeline()`) rather than chaining multiple `gsap.to()` calls

## Webflow-Specific Rules
- Target elements by `data-*` attributes (e.g. `data-animate="hero"`) rather than class names — Webflow class names can change
- Never select elements by auto-generated Webflow classes (e.g. `.w-nav`, `.w-embed`)
- If interacting with Webflow CMS list items, wait for the DOM to be ready before querying
- Avoid touching the Webflow navbar, slider, or tab components directly with JS unless you know the Webflow API for those components

## What to Avoid
- Don't add unnecessary error handling for scenarios that can't happen
- Don't over-engineer — keep it simple
- Don't use jQuery (Webflow includes it but it adds confusion)
- Don't use `var` or old-style `function` declarations where arrow functions work
- Don't write code that requires a build step or npm — everything runs directly in the browser

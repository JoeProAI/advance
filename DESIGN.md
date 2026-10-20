# Advance Design

Governing spec: [`docs/frontend-design-SKILL.md`](docs/frontend-design-SKILL.md). This file is the Art Direction Brief, the signature element, and the Extension Notes. Tokens live in [`app/globals.css`](app/globals.css).

## Before Writing Code

**Purpose.** A walk-up tour desk. A booker or act names a musician or comedian. Qloo heatmaps name cities. The product returns a drivable run, rooms, openers, and a promo brief. The judge path is the landing, three one-click acts, and a map.

**Constraints.** Next.js App Router, TypeScript, token-driven CSS, mock-first Qloo, no signup. WCAG AA intent, keyboard access, visible focus. Touch targets at least 44px.

**Brand anchors.** Specific, dated, useful. No Inter, Roboto, Arial, purple SaaS, or emoji icons. No placeholder copy.

**Honest check of the previous look.** Dark field, sodium amber, condensed all-caps display, and mono labels were a blend. That cluster is a common cinematic-dashboard pattern. Dark mode was a prestige default, not a choice that uniquely strengthened one extreme. The skill asks for one committed direction and forbids convergence on common AI aesthetic patterns. The visual layer is redone from the art direction down.

**Dark mode.** Not used. The object is a printed weekly. Ink on newsprint is the direction. A dark theme would cancel it.

## Art Direction Brief

### Direction and tone

A daylight city weekly on a copy desk. The product is an issue you can hand a booker: masthead, classified coupon, center-spread atlas plate, listings table. Warm newsprint, black ink, one vermillion stamp. The voice is a listings editor: short, dated, useful. No cheerleading. Every surface should feel typeset for this week’s run, not lit for a nightclub app.

### Type pairing concept

Literary display against a reading serif. **Fraunces** carries the masthead and city names the way a weekly carries a cover deck: soft, optical, sentence case, tight leading. **Source Serif 4** sets briefs and helper lines for continuous reading. **IBM Plex Mono** is reserved for stamps, dates, affinities, and shield numbers. Fallbacks stay in the same family of old-style serifs and slab monospaces. Inter, Roboto, Arial, and anonymous system stacks are forbidden. Display type is not all-caps.

### Palette logic

One dominant hue: **newsprint ochre**, the uncoated sheet. Accents are vermillion stamp ink (actions, route, danger), cobalt (focus rings, water, carbon actions), and graphite for muted type. Success is a library green, used only when a run is filed. Warning is a pencil ochre for holds. Contrast is functional: ink on newsprint for reading, vermillion for wayfinding, cobalt for focus-visible so the stamp color never hides the keyboard.

### Motion grammar

One entrance, like an issue settling on the desk. Sheets rise a few millimeters and the grain veil holds still. Transforms and opacity only. Durations come from `--duration-fast`, `--duration-base`, and `--duration-slow`. Easing is a long ease-out for lifts and a short spring for stamps. After the entrance, motion is feedback only: hover lift on coupons, pressed flatten, focus ring, route dash. `prefers-reduced-motion` cancels the sequence and snaps every element to its resting opacity and transform.

### Material and texture

Uncoated newsprint with a paper-fold offset, perforated coupon notches, vermillion highway shields, a faint grain veil, and a hairline rule language. Depth is always a hard paper offset, never a soft blur. The atlas is a printed plate: cream land, pale water, vermillion dash, numbered discs. Glass is not used.

## Signature element

**The perforated classified coupon.**

It is the primary control, not ornament. Example acts are coupons you stamp to open a run. The advance sheet on the landing is a coupon you fill. Share and CSV controls reprint the same coupon language. Failure states reprint the coupon with a VOID or HOLD stamp and a recovery action on the stub. Plan state is stamped on the coupon: OPEN, ROUTING, FILED, VOID, HOLD. The perforation and shield number are how a booker recognizes a stop on the plate, in the legend, and in the itinerary. Without the coupon there is no way to start, share, or recover a run.

## Extension Notes

- Add colors only as named tokens in `:root`. Do not introduce a second accent family or a dark theme.
- New components must implement default, hover, active, focus-visible, disabled, and loading, plus error and empty when they hold data.
- New type sizes must pair a `--text-*` with a `--leading-*`.
- Motion must use the three durations and two eases. No new keyframes that animate layout properties.
- Copy stays in the listings-editor voice. No emoji. No lorem. No vague marketing.
- Force a failure path with `?fail=` or `/preview?state=` before inventing a new error layout.
- Keep the coupon, the shield, the plate discs, and the dispatch log as the only wayfinding language.
- The CONUS locator is an HTML overlay on the visible map frame, anchored bottom-right and clear of the legend.
- Rooms and First date hide native browser chrome. Marks use `currentColor` on field tokens and stay keyboard operable.

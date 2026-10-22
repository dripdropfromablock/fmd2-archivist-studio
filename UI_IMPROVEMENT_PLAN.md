# UI Motion and Performance Plan

## Goal

Give FMD2 Studio a calmer, more deliberate sense of movement: navigation should clearly track the current workspace, new content should arrive in a readable order, and feedback should feel connected to the action that caused it. Keep the existing dark studio design, preserve all interactions, and keep motion optional and lightweight.

## Motion Rules

- Animate opacity and small transforms; avoid moving layout, scroll-jacking, and continuously looping decoration.
- Use one transition for a workspace change. Let the active navigation mark move at the same time so the shell and content feel connected.
- Stagger only short, finite content lists, with a hard delay cap. Do not animate frequently updating download progress rows.
- Let the saved `minimal` and `snappy` preferences shape timing. System reduced-motion must remove both animation time and stagger delay so content never waits to appear.
- Keep hover lift subtle, gated by the existing card-hover setting, and available through keyboard focus as well.

## Work Plan

### 1. Motion foundation — in place

- Keep the existing lazy-loaded workspace screens and accessible loading fallback; the production entry bundle is below Vite's 500 kB warning threshold.
- Use the existing `animate-view-enter` as the single entry transition for Browse, Read Later, Downloads, Reader, Archivist, Settings, and series pages.
- Keep the short modal, dropdown, button, and reader/download progress interactions already in the stylesheet.

### 2. Navigation and workspace continuity — this pass

- Give desktop tabs a smoothly scaling, theme-colored underline and expose the active destination with `aria-current="page"`.
- Keep the originating section selected while a series page is open, matching its Back action.
- Tune the workspace entrance to a short fade and lift with no layout reflow.

### 3. Content reveal and card feedback — this pass

- Stagger Browse result cards and Read Later items by their visible order, capped to a short total delay.
- Add a restrained hover/focus lift to Read Later rows when card hover effects are enabled.
- Keep card order and data stable; only newly mounted cards should run the entrance animation.

### 4. Motion preferences and accessibility — this pass

- Make `snappy` reduce both duration and stagger spacing.
- Make `minimal` and `prefers-reduced-motion` clear animation delays as well as duration, preventing briefly hidden content.
- Retain visible keyboard focus and avoid making hover the only signal for an interactive row.

### 5. Final review — after implementation

- Check the running app through Browse, Read Later, Downloads, Reader, Archivist, Settings, series, and modal routes.
- Check one narrow viewport and one desktop viewport for clipped motion or content shifts.
- Run the existing lint, unit, and production build checks; compare the emitted entry chunk with the pre-split baseline of 581.62 kB minified / 149.78 kB gzipped.

## Acceptance Criteria

- Workspace changes have one brief entrance transition; the reader keeps its full-width layout.
- The active desktop tab underline transitions smoothly, and screen-reader state follows the current workspace, including the series return context.
- Browse and Read Later cards reveal in order with a bounded delay; hover lift obeys the existing preference.
- Reduced motion shows content immediately with no residual stagger delay. `snappy` feels faster than the default, and `minimal` remains still.
- Download progress stays static while its existing progress fill transitions smoothly.
- No route, reader, queue, or modal behavior changes as a side effect of motion.
- Existing lint, tests, and production build pass.

## Future Work, Only If Review Calls For It

- Add exit animation to removed queue items only if it can preserve immediate keyboard and screen-reader behavior.
- Add a light success acknowledgement to discrete queue and download actions; do not animate recurring progress or polling updates.
- Consider route-specific transitions only if live review shows the shared treatment does not suit the reader or a dense settings screen.

# RimWorld UI Implementation Plan

## Objective
Implement the frontend UI based on the existing `rimun` skeleton using the established RimWorld design system (sharp corners, heavy borders, industrial colors). 
The stack remains React + React Router + TanStack Query + shadcn/ui.

## Key Files & Context
- Layout: `packages/web/src/app/router.tsx`
- Pages: `packages/web/src/pages/HomePage.tsx`, `packages/web/src/pages/SettingsPage.tsx`
- New UI Components: `packages/web/src/shared/components/ui/*.tsx`

## Implementation Steps
1. Create `shadcn/ui` foundational components manually without Radix UI dependencies for better desktop performance:
   - `button.tsx`: Gizmo style, heavy borders.
   - `input.tsx`: Boxy inputs for settings.
   - `card.tsx`: Inspection pane style panels.
   - `badge.tsx`: High-contrast status indicators.
   - `checkbox.tsx`: RimWorld-style check toggle.
2. Update Layout:
   - Introduce a minimal desktop shell navigation sidebar in `router.tsx`.
3. Update `HomePage.tsx`:
   - Implement the Mod Manager split-pane view (mod list + side inspection).
4. Update `SettingsPage.tsx`:
   - Refactor forms to use the new UI components.
5. Add custom CSS scrollbars in `globals.css`.

## Verification & Testing
- Ensure no dependency on non-existent packages.
- Ensure the app builds (`bun run dev`).
- Visual check of the RimWorld UI style constraints.
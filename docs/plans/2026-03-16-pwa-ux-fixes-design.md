# PWA UX Fixes Design — 2026-03-16

## Overview

Three categories of UX bugs in the ProTask PWA that degrade the mobile experience:

1. **FAB "New Job" navigates to list instead of create form**
2. **Virtual keyboard covers form inputs in all bottom-sheet modals**
3. **General PWA responsiveness — `vh` units, modal heights, safe areas**

---

## Fix 1: FAB Plus Button → Direct Create Form

### Problem
`FabMenu` "New Job" calls `onSelectJob` → `setShowJobsView(true)` in `page.tsx`. This opens `JobsView` which renders a full job list. The user must then find and press "Add Job" for a second tap to reach the create form. A plus button should mean "create now."

### Solution
Add `autoOpenAdd?: boolean` prop to `JobsView`. When `true`, initialize `showAddJob = true` so the inline add-job input is visible immediately and auto-focused. In `page.tsx`, pass `autoOpenAdd` when opening from the FAB.

**Files changed:**
- `src/components/JobsView.tsx` — add `autoOpenAdd` prop, initialize state from it
- `src/app/page.tsx` — pass `autoOpenAdd={true}` on the FAB-triggered `JobsView`

---

## Fix 2: Virtual Keyboard Scroll Fix

### Problem
All modals use `position: fixed` anchored to the bottom (`items-end`). On iOS/Android, the virtual keyboard opens *over* the layout without resizing fixed elements, burying inputs beneath the keyboard. The user cannot see what they type.

### Solution (two-part)

**Part A — Viewport meta**: Add `interactiveWidget: "resizes-content"` to the Next.js `Viewport` export in `layout.tsx`. This instructs the browser to shrink the layout viewport when the keyboard appears, causing all fixed elements to shift up automatically.

**Part B — Modal height units**: Replace `max-h-[Xvh]` with `max-h-[Xdvh]` across all affected modals so height is calculated from the *dynamic* viewport (post-keyboard-resize), not the initial viewport.

**Files changed:**
- `src/app/layout.tsx` — add `interactiveWidget: "resizes-content"` to `viewport` export
- `src/components/AddTaskModal.tsx` — `max-h-[70vh]` → `max-h-[90dvh]`
- `src/components/CalendarView.tsx` — `max-h-[60vh]` → `max-h-[85dvh]`
- `src/components/AdminView.tsx` — two bottom-sheet modals (lines ~1166, ~1262), ensure `dvh` units
- `src/components/TimeEntryModal.tsx` — audit and fix modal container height

---

## Fix 3: Full PWA Responsiveness Audit

### Items already correct
- `TaskDetailDrawer.tsx` — already uses `max-h-[80dvh]` ✓
- `BottomNav.tsx` — already uses `env(safe-area-inset-bottom)` ✓
- `page.tsx` main — uses `h-dvh` and `env(safe-area-inset-bottom)` padding ✓

### Items to fix
- Remove any remaining `vh` units in modal/drawer components in favor of `dvh`
- Ensure `pb-safe` / `env(safe-area-inset-bottom)` is applied to all bottom-anchored sheets
- Add `scrollIntoView` behavior on input focus inside modals where the keyboard would obscure lower fields (defense-in-depth alongside the viewport fix)

---

## Non-Goals
- No redesign of modal UI
- No changes to data fetching logic
- No new modals or components beyond the `autoOpenAdd` prop

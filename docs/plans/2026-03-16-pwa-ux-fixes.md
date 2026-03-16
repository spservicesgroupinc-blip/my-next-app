# PWA UX Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix three PWA UX bugs: (1) FAB "New Job" opens list instead of create form, (2) virtual keyboard covers modal inputs on mobile, (3) remaining `vh` units in modals that break on keyboard-open.

**Architecture:** Minimal targeted edits across 6 files. The keyboard fix is a two-part change: one viewport meta addition in `layout.tsx` tells the browser to resize the layout when the keyboard opens, then `dvh` units in each modal ensure height is computed from the resized (post-keyboard) viewport. The FAB fix adds one prop to `JobsView` and passes it from `page.tsx`.

**Tech Stack:** Next.js 14 App Router, React, Tailwind CSS. No new dependencies.

---

### Task 1: Add `interactiveWidget` to viewport (keyboard resize fix, root cause)

**Files:**
- Modify: `src/app/layout.tsx:26-33`

**What this does:** `interactive-widget=resizes-content` tells Chrome/Safari to shrink the CSS layout viewport when the virtual keyboard opens. Every `position: fixed` element in the app will then automatically shift up out of the keyboard's way, with zero JS.

**Step 1: Open the file**

Read `src/app/layout.tsx`. Find the `viewport` export (lines 26-33):

```ts
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#ea580c",
};
```

**Step 2: Add `interactiveWidget`**

Replace the viewport export with:

```ts
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#ea580c",
  interactiveWidget: "resizes-content",
};
```

**Step 3: Verify build compiles**

```bash
cd C:\Users\russe\my-next-app
npm run build 2>&1 | tail -20
```

Expected: no TypeScript errors. `Viewport` type in Next.js 14 supports `interactiveWidget`.

**Step 4: Commit**

```bash
git add src/app/layout.tsx
git commit -m "fix: add interactiveWidget=resizes-content for virtual keyboard layout"
```

---

### Task 2: Fix `AddTaskModal` height — `vh` → `dvh`

**Files:**
- Modify: `src/components/AddTaskModal.tsx:163`

**What this does:** `max-h-[70vh]` is calculated from the initial viewport height (before keyboard opens). After Task 1's viewport change, the layout shrinks when the keyboard opens — but `70vh` still refers to the *original* height in some browsers. `dvh` (dynamic viewport height) always reflects the current viewport size, including after keyboard resize.

**Step 1: Find the modal panel**

In `AddTaskModal.tsx` line 163:
```tsx
className="w-full max-w-lg rounded-t-2xl sm:rounded-2xl bg-white p-5 pb-8 animate-[slideUp_0.3s_ease-out] max-h-[70vh] overflow-y-auto"
```

**Step 2: Replace `max-h-[70vh]` with `max-h-[90dvh]`**

```tsx
className="w-full max-w-lg rounded-t-2xl sm:rounded-2xl bg-white p-5 pb-8 animate-[slideUp_0.3s_ease-out] max-h-[90dvh] overflow-y-auto"
```

The increase from 70 → 90 also gives the form more room before it needs to scroll, improving UX on tablets.

**Step 3: Commit**

```bash
git add src/components/AddTaskModal.tsx
git commit -m "fix: use dvh units in AddTaskModal for keyboard-aware height"
```

---

### Task 3: Fix `CalendarView` day modal height — `vh` → `dvh`

**Files:**
- Modify: `src/components/CalendarView.tsx:130`

**Step 1: Find the day modal panel**

In `CalendarView.tsx` line 130:
```tsx
className="w-full max-w-lg rounded-t-2xl bg-white p-5 pb-8 max-h-[60vh] overflow-y-auto animate-[slideUp_0.3s_ease-out]"
```

**Step 2: Replace `max-h-[60vh]` with `max-h-[85dvh]`**

```tsx
className="w-full max-w-lg rounded-t-2xl bg-white p-5 pb-8 max-h-[85dvh] overflow-y-auto animate-[slideUp_0.3s_ease-out]"
```

**Step 3: Commit**

```bash
git add src/components/CalendarView.tsx
git commit -m "fix: use dvh units in CalendarView day modal"
```

---

### Task 4: Fix `AdminView` "Add Employee" and "Edit Employee" modals — add scroll container

**Files:**
- Modify: `src/components/AdminView.tsx:1170` and `src/components/AdminView.tsx:1266`

**What this does:** Both modals have no max-height set on the white panel — they grow to content height which can overflow off-screen on small phones when the keyboard is open. Add `max-h-[90dvh] overflow-y-auto`.

**Step 1: Fix "Add Employee" modal panel (line ~1170)**

Find:
```tsx
className="w-full max-w-lg rounded-t-2xl bg-white p-5 pb-8"
```
(This is the first such line — inside `{showAddEmployee && (` block)

Replace with:
```tsx
className="w-full max-w-lg rounded-t-2xl bg-white p-5 pb-8 max-h-[90dvh] overflow-y-auto"
```

**Step 2: Fix "Edit Employee" modal panel (line ~1266)**

Find the second occurrence:
```tsx
className="w-full max-w-lg rounded-t-2xl bg-white p-5 pb-8"
```
(Inside `{editEmployee && (` block)

Replace with:
```tsx
className="w-full max-w-lg rounded-t-2xl bg-white p-5 pb-8 max-h-[90dvh] overflow-y-auto"
```

**Step 3: Commit**

```bash
git add src/components/AdminView.tsx
git commit -m "fix: add dvh max-height and scroll to AdminView employee modals"
```

---

### Task 5: Fix `TimeEntryModal` — wrap form in scrollable container

**Files:**
- Modify: `src/components/TimeEntryModal.tsx:120-122`

**What this does:** `TimeEntryModal` uses `fixed inset-x-0 bottom-0` with no height cap. The white panel has no `max-h`, so on a small screen with the keyboard open, the submit button is cut off. Add `max-h-[90dvh] overflow-y-auto` to the white inner panel.

**Step 1: Find the white panel**

In `TimeEntryModal.tsx` line 120-124:
```tsx
<div className="fixed inset-x-0 bottom-0 z-[160] mx-auto w-full max-w-lg">
  <div
    className="m-4 rounded-t-2xl bg-white shadow-2xl"
    onClick={(e) => e.stopPropagation()}
  >
```

**Step 2: Add `max-h-[90dvh] overflow-y-auto` to the inner white div**

```tsx
<div className="fixed inset-x-0 bottom-0 z-[160] mx-auto w-full max-w-lg">
  <div
    className="m-4 rounded-t-2xl bg-white shadow-2xl max-h-[90dvh] overflow-y-auto"
    onClick={(e) => e.stopPropagation()}
  >
```

**Step 3: Commit**

```bash
git add src/components/TimeEntryModal.tsx
git commit -m "fix: add dvh max-height and scroll to TimeEntryModal"
```

---

### Task 6: Fix FAB "New Job" — open directly to create form

**Files:**
- Modify: `src/components/JobsView.tsx:9-19` (interface + component signature)
- Modify: `src/components/JobsView.tsx:14-19` (useState for showAddJob)
- Modify: `src/app/page.tsx:707` (JobsView usage)

**What this does:** Right now, clicking "New Job" in the FAB opens `JobsView` showing a full list. The user must then tap "Add Job" again. Adding an `autoOpenAdd` boolean prop initializes the `showAddJob` state to `true` so the create form is immediately visible and focused.

**Step 1: Add `autoOpenAdd` to `JobsViewProps` interface**

In `JobsView.tsx`, find:
```tsx
interface JobsViewProps {
  onClose: () => void;
  onSelectJob: (jobName: string) => void;
}
```

Replace with:
```tsx
interface JobsViewProps {
  onClose: () => void;
  onSelectJob: (jobName: string) => void;
  autoOpenAdd?: boolean;
}
```

**Step 2: Accept and use the prop in the component**

Find:
```tsx
export default function JobsView({ onClose, onSelectJob }: JobsViewProps) {
```

Replace with:
```tsx
export default function JobsView({ onClose, onSelectJob, autoOpenAdd }: JobsViewProps) {
```

**Step 3: Initialize `showAddJob` from the prop**

Find:
```tsx
  const [showAddJob, setShowAddJob] = useState(false);
```

Replace with:
```tsx
  const [showAddJob, setShowAddJob] = useState(autoOpenAdd ?? false);
```

**Step 4: Pass `autoOpenAdd={true}` from `page.tsx`**

In `src/app/page.tsx`, find the `JobsView` usage inside the `{showJobsView && (` block (around line 707):
```tsx
              <JobsView
                onClose={() => setShowJobsView(false)}
                onSelectJob={(jobName) => {
                  setShowJobsView(false);
                  setShowTimeEntryModal(true);
                  // Note: You may want to pass the selected job to TimeEntryModal
                }}
              />
```

Replace with:
```tsx
              <JobsView
                autoOpenAdd
                onClose={() => setShowJobsView(false)}
                onSelectJob={(jobName) => {
                  setShowJobsView(false);
                  setShowTimeEntryModal(true);
                }}
              />
```

**Step 5: Verify build**

```bash
npm run build 2>&1 | tail -20
```

Expected: clean build, no TypeScript errors.

**Step 6: Commit**

```bash
git add src/components/JobsView.tsx src/app/page.tsx
git commit -m "fix: FAB New Job opens directly to create form via autoOpenAdd prop"
```

---

### Task 7: Final verification

**Step 1: Start dev server**

```bash
npm run dev
```

**Step 2: Manual checklist**

- [ ] Click FAB → "New Job" → create form is immediately visible with input focused (not the list)
- [ ] Open AddTaskModal on mobile/devtools mobile view → tap an input → keyboard opens → form scrolls up, inputs remain visible
- [ ] CalendarView day tap → keyboard fix works
- [ ] AdminView "Add Employee" → form scrollable with keyboard open
- [ ] TimeEntryModal → all fields reachable with keyboard open

**Step 3: Final commit if any last tweaks made**

```bash
git add -p
git commit -m "fix: pwa mobile ux - keyboard and plus-button navigation fixes"
```

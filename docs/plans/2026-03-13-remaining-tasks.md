# Remaining Tasks — World-Class UI Implementation

> Status as of 2026-03-13. Tasks 1–3 are complete. Tasks 4–7 remain.

---

## ✅ Completed

| Task | Description | Files |
|------|-------------|-------|
| 1 | Add `updated_by` to Task type + `handleUpdateTask` in page.tsx | `src/lib/types.ts`, `src/app/page.tsx` |
| 2 | Create TaskDetailDrawer.tsx | `src/components/TaskDetailDrawer.tsx` |
| 3 | Create KanbanBoard.tsx | `src/components/KanbanBoard.tsx` |

---

## ❌ Remaining

### Task 4: Update TaskCard.tsx

**File:** `src/components/TaskCard.tsx`

**What to change:**
1. Add `onOpen` prop to interface: `onOpen: (task: Task) => void;`
2. Accept `onOpen` in the destructured props
3. Make entire card clickable: add `onClick={() => onOpen(task)}` to outer `<div>`
4. Wrap action buttons (complete/delete) and checklist area in `onClick={(e) => e.stopPropagation()}` to prevent bubbling
5. Add priority left border via `border-l-4` + color map:
   - Low → `border-l-slate-300`
   - Medium → `border-l-blue-400`
   - High → `border-l-amber-400`
   - Critical → `border-l-red-500`
6. Add "In Progress" animated pulse: when `status === "in_progress"`:
   - Add `ring-1 ring-blue-200` to card
   - Show a shimmer bar at top: `<div className="h-0.5 w-full rounded-t-xl bg-gradient-to-r from-blue-400 via-blue-500 to-blue-400 bg-[length:200%_100%] animate-[shimmer_2s_linear_infinite]" />`
   - Show "In Progress" badge with pulse dot
7. Add `cursor-pointer` and `hover:-translate-y-0.5` to card

---

### Task 5: Update TasksView.tsx

**File:** `src/components/TasksView.tsx`

**What to change (full rewrite):**
1. Add imports: `LayoutList`, `LayoutGrid` from lucide-react; `KanbanBoard`, `TaskDetailDrawer` components; `useAuth` context
2. Add new props to interface: `onUpdateTask`, `isAdmin`
3. Accept new props in destructured params
4. Add state: `viewMode` (list/kanban, persisted to localStorage), `openTask` (for drawer)
5. Add List/Kanban toggle buttons next to search bar
6. Show status filter only in list view
7. Pass `onOpen={handleOpenTask}` to each `<TaskCard>`
8. Render `<KanbanBoard>` when `viewMode === "kanban"`
9. Render `<TaskDetailDrawer>` when `syncedOpenTask` is non-null
10. Keep open task synced with tasks array for Realtime updates

---

### Task 6: Rewrite AdminView.tsx Live Tab — Mission Control

**File:** `src/components/AdminView.tsx`

**What to change:**

#### Step 1: Add state + types (inside component function, after existing state)
- Add `ActivityEvent` interface with: `id`, `type`, `employeeName`, `taskTitle`, `jobName`, `timestamp`
- Add `activityFeed` state array
- Add tick interval for live elapsed time (`setInterval` every 1s)

#### Step 2: Update Realtime subscription
- Replace the `.on("postgres_changes", { event: "*", table: "tasks" }, ...)` handler to also build activity feed events from INSERT/UPDATE payloads

#### Step 3: Replace Live tab JSX
Replace the entire `{adminTab === "live" && (...)}` block with mission control layout:
- **Summary row:** 4-column grid (Clocked In, Off/Away, In Progress, Open Tasks)
- **Split layout:** `flex-col lg:flex-row`
  - **Left (58%):** Employee cards with:
    - Avatar initials circle
    - Name + online pulse dot + elapsed time
    - Job info + hourly rate
    - Current task highlight card with SVG progress ring
    - "No active task" amber state when clocked in but idle
    - "+N more tasks" count
  - **Right (42%):** Activity feed with:
    - "● Live" pulse indicator
    - Real-time event stream (colored dots + labels)
    - Empty state with Clock icon

#### Step 4: Add missing import
- Add `Clock` to lucide-react imports at top of file

---

### Task 7: Globals CSS + Final Verification

**File:** `src/app/globals.css`

#### Step 1: Add shimmer keyframes
After the existing `@keyframes slideUp` block, add:
```css
@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

#### Step 2: Verify
```bash
npm run dev          # should compile clean
npx tsc --noEmit     # 0 errors
```

#### Step 3: Smoke test
- [ ] Click any task card → TaskDetailDrawer opens
- [ ] Edit title in drawer → saves on blur
- [ ] Change assignee/job/priority/due date → saves immediately
- [ ] Toggle checklist items in drawer → updates progress ring
- [ ] Click Active / In Progress / Done status buttons → updates card
- [ ] Toggle to Board view → kanban renders 3 columns
- [ ] Drag a card to a different column → status updates
- [ ] Tap any kanban card → TaskDetailDrawer opens
- [ ] Admin tab → Live view shows split layout with 4-stat summary
- [ ] Make a task change → appears in activity feed

#### Step 4: Commit
```bash
git add src/components/TaskCard.tsx src/components/TasksView.tsx src/components/AdminView.tsx src/app/globals.css
git commit -m "feat: task detail drawer, kanban board, mission control admin live view"
```

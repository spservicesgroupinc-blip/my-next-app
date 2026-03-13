# ProTask World-Class UI Upgrade — Design Doc
Date: 2026-03-13

## Summary
Three major feature additions + a visual polish pass to make ProTask a world-class field service PWA.

## User Decisions
- Task view: List (default) + Kanban board toggle (Option C)
- Admin live view: Split layout — employee cards + activity feed mission control (Option C)
- Task edit permissions: Everyone edits everything, with audit trail "Last edited by [name]" (Option C)
- Implementation approach: Feature-forward — build new components with full polish, refactor only what's needed (Option C)

## Features

### 1. TaskDetailDrawer
New component `TaskDetailDrawer.tsx`. Triggered by clicking anywhere on a TaskCard.

- Slides up from bottom (mobile) / slides in from right (desktop)
- Inline-editable title
- Editable fields: Assignee, Job, Priority, Due Date
- Full checklist management: add/edit/delete/reorder items
- Progress ring (SVG) showing checklist completion %
- Status action bar: Active / In Progress / Complete buttons
- Audit footer: "Last edited by [name] · [time ago]"
- Auto-saves to Supabase on change (no save button), optimistic UI
- Close via X, backdrop click, or Escape key

### 2. KanbanBoard
New component `KanbanBoard.tsx`. Toggled from TasksView header.

- 3 columns: Active · In Progress · Done
- Drag-and-drop cards between columns → updates task.status in Supabase
- Column headers with live task count badges
- Compact card design: title, assignee avatar initials, priority dot, checklist progress bar
- Tap any card → opens TaskDetailDrawer
- Admin sees all tasks; employees see own tasks only
- Toggle state persisted to localStorage

### 3. Admin Live View — Mission Control
Refactor `AdminView.tsx` Live tab into split-panel layout.

**Left panel (58%) — Employee Cards:**
- Current task title in highlighted chip
- SVG progress ring for checklist completion (animated)
- Live elapsed time ticker on current task (updates every second)
- Clock-in time + total hours today
- Hover/long-press quick actions: Reassign Task, View All Tasks
- Amber "No active task" state when clocked in but idle

**Right panel (42%) — Activity Feed:**
- Real-time event stream via Supabase Realtime
- Event types: Completed (green), In Progress (blue), Edited (orange), Created (gray)
- Relative timestamps ("just now", "3 min ago")
- "● Live" pulse indicator at top
- Mobile: tabbed ("Team" / "Activity")

**Summary bar:** Clocked In · Open Tasks · In Progress · Completed Today — all live

### 4. Visual Polish Pass
- TaskCard: left border color-coded by priority, In Progress animated pulse, tappable anywhere
- Empty states: inline SVG illustrations
- Consistent enter/exit animations on all modals/drawers
- Bottom nav active state more pronounced
- Desktop hover lift effect on TaskCards
- Kanban drag-ghost semi-transparent effect

## Data
No schema migrations needed. Uses existing `status: "in_progress"` type already defined but unused.
Activity feed driven by existing Supabase Realtime subscriptions.
New field needed: `updated_by` on tasks table (optional — can derive from auth context client-side for audit trail display).

## Files to Create
- `src/components/TaskDetailDrawer.tsx`
- `src/components/KanbanBoard.tsx`

## Files to Modify
- `src/components/TaskCard.tsx` — make tappable, add priority border, pulse animation
- `src/components/TasksView.tsx` — add list/kanban toggle, wire drawer
- `src/components/AdminView.tsx` — mission control split layout for Live tab
- `src/app/page.tsx` — pass new handlers (updateTask, setInProgress) down to components
- `src/lib/types.ts` — add `updated_by?: string` to Task interface

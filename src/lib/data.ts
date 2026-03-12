import { Task, TimeEntry, ChatMessage } from "./types";

export const mockTasks: Task[] = [
  {
    id: "1",
    title: "Install kitchen cabinets",
    assignedTo: "Mike Johnson",
    jobName: "Riverside Kitchen Remodel",
    dueDate: "2026-03-14",
    priority: "Critical",
    status: "active",
    checklist: [
      { id: "c1", text: "Remove old cabinets", completed: true },
      { id: "c2", text: "Check plumbing alignment", completed: true },
      { id: "c3", text: "Install upper cabinets", completed: false },
      { id: "c4", text: "Install lower cabinets", completed: false },
      { id: "c5", text: "Attach hardware", completed: false },
    ],
  },
  {
    id: "2",
    title: "Finish drywall in master bedroom",
    assignedTo: "Sarah Lee",
    jobName: "Oak St. New Build",
    dueDate: "2026-03-15",
    priority: "High",
    status: "active",
    checklist: [
      { id: "c6", text: "Tape joints", completed: true },
      { id: "c7", text: "Apply first coat of mud", completed: false },
      { id: "c8", text: "Sand and apply finish coat", completed: false },
    ],
  },
  {
    id: "3",
    title: "Pour concrete for patio slab",
    assignedTo: "Carlos Rivera",
    jobName: "Henderson Backyard",
    dueDate: "2026-03-12",
    priority: "Medium",
    status: "active",
    checklist: [
      { id: "c9", text: "Set forms", completed: true },
      { id: "c10", text: "Place rebar", completed: true },
      { id: "c11", text: "Schedule concrete truck", completed: true },
      { id: "c12", text: "Pour and level", completed: false },
    ],
  },
  {
    id: "4",
    title: "Electrical rough-in for garage",
    assignedTo: "Mike Johnson",
    jobName: "Oak St. New Build",
    dueDate: "2026-03-18",
    priority: "Low",
    status: "active",
    checklist: [
      { id: "c13", text: "Run conduit", completed: false },
      { id: "c14", text: "Pull wires", completed: false },
      { id: "c15", text: "Install boxes", completed: false },
    ],
  },
  {
    id: "5",
    title: "Paint exterior trim",
    assignedTo: "Sarah Lee",
    jobName: "Riverside Kitchen Remodel",
    dueDate: "2026-03-10",
    priority: "Medium",
    status: "completed",
    checklist: [
      { id: "c16", text: "Scrape and sand", completed: true },
      { id: "c17", text: "Apply primer", completed: true },
      { id: "c18", text: "Apply two coats of paint", completed: true },
    ],
  },
  {
    id: "6",
    title: "Replace bathroom fixtures",
    assignedTo: "Carlos Rivera",
    jobName: "Henderson Backyard",
    dueDate: "2026-03-20",
    priority: "High",
    status: "active",
    checklist: [
      { id: "c19", text: "Remove old faucet", completed: false },
      { id: "c20", text: "Install new faucet", completed: false },
      { id: "c21", text: "Replace showerhead", completed: false },
    ],
  },
];

export const mockTimeEntries: TimeEntry[] = [
  {
    id: "t1",
    jobName: "Riverside Kitchen Remodel",
    clockIn: "2026-03-12T07:00:00",
    clockOut: "2026-03-12T15:30:00",
    hourlyRate: 35,
  },
  {
    id: "t2",
    jobName: "Oak St. New Build",
    clockIn: "2026-03-11T06:30:00",
    clockOut: "2026-03-11T14:00:00",
    hourlyRate: 35,
  },
];

export const mockChatMessages: ChatMessage[] = [
  {
    id: "m1",
    sender: "Mike Johnson",
    text: "Hey team, the cabinet delivery is confirmed for Thursday morning.",
    timestamp: "2026-03-12T08:15:00",
  },
  {
    id: "m2",
    sender: "Sarah Lee",
    text: "Got it! I'll finish the drywall by Wednesday so the kitchen area is clear.",
    timestamp: "2026-03-12T08:22:00",
  },
  {
    id: "m3",
    sender: "Carlos Rivera",
    text: "Concrete truck is scheduled for 9 AM today. Need someone to help with leveling.",
    timestamp: "2026-03-12T08:30:00",
  },
  {
    id: "m4",
    sender: "Mike Johnson",
    text: "I can help after 10. Just need to finish up the electrical layout first.",
    timestamp: "2026-03-12T08:35:00",
  },
  {
    id: "m5",
    sender: "Sarah Lee",
    text: "Don't forget we have the site inspection on Friday at 2 PM.",
    timestamp: "2026-03-12T09:00:00",
  },
  {
    id: "m6",
    sender: "Carlos Rivera",
    text: "Thanks for the reminder. I'll make sure the patio area is cleaned up by then.",
    timestamp: "2026-03-12T09:10:00",
  },
];

export const jobNames = [
  "Riverside Kitchen Remodel",
  "Oak St. New Build",
  "Henderson Backyard",
];

export const currentUser = {
  name: "Mike Johnson",
  initials: "MJ",
  hourlyRate: 35,
};

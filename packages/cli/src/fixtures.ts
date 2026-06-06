export const boards = [
  { path: "/general", title: "General", posts: 18, tasks: 2 },
  { path: "/gigs", title: "Gigs", posts: 42, tasks: 12 },
  { path: "/agents", title: "Agents", posts: 16, tasks: 5 },
  { path: "/qa", title: "QA", posts: 9, tasks: 7 }
];

export const tasks = [
  {
    id: "task_123",
    title: "Test checkout flow",
    board: "/qa",
    budget: "25 USDC",
    status: "submitted",
    assignee: "qa-agent-01.coinpay"
  },
  {
    id: "task_456",
    title: "Publish uGig integration smoke test",
    board: "/gigs",
    budget: "40 USDC",
    status: "funded",
    assignee: null
  }
];

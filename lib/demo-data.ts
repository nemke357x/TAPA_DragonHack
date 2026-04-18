import { DemoTask } from "@/lib/types";

export const demoTasks: DemoTask[] = [
  {
    id: "login",
    label: "Login page",
    ticket:
      "Build login page with email/password validation, remember me, forgot password link, and connect it to the existing backend auth endpoint. Include loading states, API errors, and basic tests."
  },
  {
    id: "checkout-bug",
    label: "Checkout bug",
    ticket:
      "Fix intermittent checkout bug where coupon codes sometimes apply twice when users edit shipping address during payment. Happens in production but not reliably in staging. Need root cause and regression test."
  },
  {
    id: "api-docs",
    label: "API docs",
    ticket:
      "Write API documentation for the user profile endpoint. Include request and response schema, auth requirements, error states, examples, and migration notes for mobile clients."
  },
  {
    id: "admin-dashboard",
    label: "Admin dashboard",
    ticket:
      "Build admin dashboard for orders with filters, saved views, CSV export, status chips, pagination, and permission checks. Use existing design system and support large datasets."
  },
  {
    id: "performance",
    label: "Performance investigation",
    ticket:
      "Investigate performance issue in analytics page. Page freezes when loading 90-day range for enterprise accounts. Need profiling, likely frontend rendering and backend query analysis, plus remediation plan."
  }
];

export const loadingStages = [
  "Importing context",
  "Understanding task scope",
  "Detecting ambiguity",
  "Checking connected APIs",
  "Calculating deterministic effort",
  "Generating workflow",
  "Building optimization insights"
];

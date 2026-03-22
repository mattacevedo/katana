# Katana — Project Context for Claude

Katana is an AI-powered grading assistant for Canvas LMS SpeedGrader.
It is a Chrome extension (Manifest V3) paired with a Next.js 15 SaaS backend.

The core value proposition: **zero friction for educators** — grading happens natively
inside SpeedGrader, not in a separate app. No copy-pasting, no IT setup required.

---

## Repository Structure

```
Katana-SaaS/
├── extension/               Chrome Extension (Manifest V3)
│   ├── manifest.json
│   ├── background/
│   │   └── service-worker.js    Main background logic, message routing
│   ├── content/
│   │   ├── content.js           SpeedGrader DOM manipulation + rubric fill
│   │   ├── content.css
│   │   └── canvadocs.js         Canvadocs iframe annotation content script
│   ├── sidepanel/
│   │   ├── sidepanel.html       Extension side panel UI
│   │   ├── sidepanel.js
│   │   └── sidepanel.css
│   └── icons/
└── web/                     Next.js 15 app (TypeScript), hosted on Vercel
    ├── app/
    │   ├── page.tsx             Landing page (has COMING_SOON flag)
    │   ├── admin/               Admin dashboard (protected by ADMIN_EMAIL env var)
    │   │   ├── page.tsx         Server component — KPIs, user tables
    │   │   ├── ActivityLog.tsx  SSE-based live activity feed
    │   │   ├── EscalationSettings.tsx
    │   │   └── AddGrades.tsx    Manual grade credit form
    │   ├── dashboard/           User-facing dashboard
    │   ├── auth/                Sign in, sign up, callback, extension-callback
    │   └── api/
    │       ├── grade/           Core grading endpoint (auth → quota → Claude)
    │       ├── quota/           Returns remaining grades for the current user
    │       ├── admin/
    │       │   ├── activity/    SSE endpoint for live activity log
    │       │   ├── settings/    Admin settings (escalation emails, etc.)
    │       │   └── add-grades/  Manually credit bonus grades to a user
    │       ├── stripe/
    │       │   ├── webhook/     Stripe event handler (plan changes, add-ons)
    │       │   └── checkout/    Creates Stripe checkout session
    │       ├── addon/           Add-on pack checkout (100 grades / $5)
    │       ├── billing/         Cancel / reactivate subscription
    │       └── upgrade/         Plan upgrade flow
    └── lib/
        ├── supabase/
        │   ├── server.ts        Cookie-based Supabase client (SSR)
        │   └── admin.ts         Service-role client (bypasses RLS)
        ├── stripe.ts            Plan limits, pricing, Stripe client
        └── logActivity.ts       Writes to activity_log table
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Extension | Chrome Manifest V3, service worker, content scripts, Side Panel API |
| Frontend | Next.js 15 (App Router), TypeScript, CSS Modules |
| Hosting | Vercel |
| Auth | Supabase magic links |
| Database | Supabase (Postgres), RLS enabled |
| Payments | Stripe (subscriptions + one-time add-ons) |
| AI | Anthropic Claude API — **model: claude-sonnet-4-6** |
| Rate limiting | Upstash Redis (sliding window, 20 req / 10 min per user) |
| Email | Postmark (via Supabase magic link config) |
| Analytics | GA4 (ID: G-NY7S0Q3FSW) |

---

## Plans & Pricing

| Plan | Price | Monthly grades |
|---|---|---|
| Free | $0 | 50 |
| Basic | $5/mo | 200 |
| Super | $20/mo | 1,000 |
| Shogun | $50/mo | 2,500 |

Add-on: 100 bonus grades for $5 (one-time, via Stripe checkout).

Grade counts live in `profiles.grades_this_period`. Reset monthly via Stripe webhook.
Bonus grades are credited with the `add_bonus_grades(p_user_id, p_amount)` Supabase RPC.
Period usage is tracked by `increment_grade_count_v2(p_user_id)` RPC, which also checks quota.

---

## Key Architectural Decisions

- **Extension never calls Claude directly.** It calls `POST /api/grade` with a Bearer token.
  The backend validates auth, checks quota, calls Claude, and returns the result.
- **Auth token flow:** Sign-in opens gradewithkatana.com. After auth, the web app sends
  the token back to the extension via `chrome.runtime.sendMessage` from the extension-callback page.
  This uses `externally_connectable` in the manifest.
- **Rubric fill:** Canvas has two rubric UI variants — classic (`#rubric_full`) and enhanced
  (`[data-testid="enhanced-rubric-assessment-container"]`). content.js handles both.
  The enhanced traditional view uses `criterion-score-{id}` inputs and
  `traditional-criterion-{id}-ratings-{index}` buttons, then clicks `save-rubric-assessment-button`.
- **Feedback ratings:** After grading, the side panel shows 👍/👎 buttons. `displayResults()` generates a `crypto.randomUUID()` per result (`currentGradeSessionId`), which is sent to `POST /api/grade/rate` with the rating. Stored in `grade_ratings` table (upserted by `grade_session_id` so users can change their rating). Admin dashboard shows overall satisfaction % KPI and per-user thumbs counts in the Top Users table.
- **Admin protection:** All `/api/admin/*` routes check that the authenticated user's email
  matches the `ADMIN_EMAIL` env var (case-insensitive).
- **Stripe webhook deduplication:** Uses Upstash Redis to prevent double-processing.

---

## Current Status (as of March 2026)

- Web app is live at gradewithkatana.com
- Extension NOT YET published to Chrome Web Store (developer account approval pending)
- `COMING_SOON = true` in `web/app/page.tsx` — **must be removed before launch**
- In-document annotations (Canvadocs) — code scaffolded in service-worker and content scripts,
  but the settings UI checkbox is intentionally hidden. Not a live feature yet.

---

## Active Roadmap / Known TODOs

- [ ] Remove `COMING_SOON` flag from `web/app/page.tsx`
- [ ] Publish to Chrome Web Store (screenshots done, promotional tile needed)
- [ ] In-document annotations (Canvadocs) — roadmap feature, do not expose in UI yet
- [ ] Admin: add more bulk user management tools as needed

---

## Things to Never Break

- `increment_grade_count_v2` RPC call in `api/grade/route.ts` — this is the quota gate
- Stripe webhook signature verification in `api/stripe/webhook/route.ts`
- The `externally_connectable` flow — how the extension receives its auth token
- RLS is active on Supabase; always use the service-role admin client for cross-user reads

---

## Environment Variables (Vercel)

Required in production:
- `ANTHROPIC_API_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- `ADMIN_EMAIL` — email address that can access `/admin`

---

## Competitor Context

Main extension competitor is **VibeGrade**. Katana differentiates on:
native Canvas integration, transparent rubric-based grading, no subscription lock-in for light users.
See `competitive-positioning.md` for full analysis.

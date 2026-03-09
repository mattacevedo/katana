# Katana — SaaS

AI-powered grading assistant for Canvas LMS SpeedGrader, as a subscription service.

## Architecture

```
Katana-SaaS/
├── extension/          Chrome extension (Manifest V3)
│   ├── manifest.json   host_permissions → api.katana.app
│   ├── background/     service-worker.js  — POSTs to /api/grade (not Claude directly)
│   ├── content/        content.js — DOM scraping + grade auto-fill (auth-token gated)
│   └── sidepanel/      Sign-in flow + grading UI
└── web/                Next.js 15 web app
    ├── app/
    │   ├── page.tsx            Landing page + pricing
    │   ├── auth/signin/        Magic-link sign-in (Supabase)
    │   ├── auth/callback/      Receives Supabase token → sends to extension
    │   ├── dashboard/          Usage + billing dashboard
    │   └── api/grade/          ← Core API: auth → quota → Claude → response
    └── lib/
        ├── supabase/           Browser + server clients
        └── stripe.ts           Stripe client + price IDs
```

## How it works

1. User installs the extension and clicks **Sign In**
2. Browser opens `app.katana.app/auth/signin` → magic link email
3. Magic link → `/auth/callback` → session token sent back to extension via `chrome.runtime.sendMessage`
4. Extension stores token in `chrome.storage.local`
5. On SpeedGrader, clicking **Grade** → extension POSTs to `/api/grade` with submission data + settings
6. `/api/grade` validates token (Supabase), checks quota, calls Claude, increments counter, returns result
7. Extension fills grade + feedback into Canvas

## Key difference from `katana-prototype`

| | `katana-prototype` | `katana` (this repo) |
|---|---|---|
| Claude call | Extension → Claude API directly | Extension → `/api/grade` → Claude |
| Auth | Claude API key in settings | Supabase magic link |
| Quota | Unlimited (user pays their own key) | Per-plan limit enforced server-side |
| Billing | None | Stripe subscriptions |

## Setup

### Extension
Load `/extension` unpacked in `chrome://extensions` (Developer Mode).
Set `NEXT_PUBLIC_EXTENSION_ID` in `web/.env.local` after loading.

### Web app
```bash
cd web
cp .env.example .env.local
# Fill in Supabase, Anthropic, Stripe keys
npm install
npm run dev
```

### Supabase schema
```sql
create table profiles (
  id uuid references auth.users primary key,
  plan text default 'free',
  grades_this_period int default 0,
  period_start timestamptz default now(),
  stripe_customer_id text
);
```

### Stripe
Set up a webhook on `https://api.katana.app/api/billing/webhook` for:
- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`

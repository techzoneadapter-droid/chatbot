# AI Paint Sales Chatbot

Professional MVP for a Vietnamese paint-company sales chatbot.

## What Works

- Next.js app router with TypeScript and Tailwind CSS.
- Local chat simulator at `/` with memory, intent detection, lead score, product recommendations, phone capture, and reset.
- Admin pages for dashboard, conversations, leads, products, and settings.
- Facebook Messenger webhook verification and message handling at `/api/webhook`.
- Supabase-ready schema in `supabase/migrations`.
- OpenAI integration when `OPENAI_API_KEY` is present; local rule-based sales engine when it is not.

## Setup

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` and fill credentials when available.

## Supabase

Run `supabase/migrations/202608160001_initial_schema.sql`, then optionally run `scripts/seed-demo.sql`.

## Facebook Webhook

- Verification endpoint: `GET /api/webhook`
- Message endpoint: `POST /api/webhook`
- Required environment variables:
  - `FACEBOOK_PAGE_ID`
  - `FACEBOOK_PAGE_ACCESS_TOKEN`
  - `FACEBOOK_VERIFY_TOKEN`

Without Facebook credentials, webhook send runs in development mode and logs the response.

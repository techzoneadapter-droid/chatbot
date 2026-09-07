# PageBot Gemini

Simple Facebook Messenger chatbot for multiple Pages, powered by Gemini.

## Core flow

- Connect one or more Facebook Pages.
- Store product information, prices, FAQ, and optional instructions separately for each Page.
- Receive Messenger messages through `/api/webhook` (also available at `/api/facebook/webhook`).
- Resolve the correct Page and conversation.
- Send only that Page's knowledge plus recent conversation history to Gemini.
- Send Gemini's answer back to the customer through Messenger.

The Messenger path is intentionally page-scoped and does not use the old sales-engine/product recommendation flow.

## Setup

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` and configure the required services.

## Required services

- Supabase for persistent Page/conversation/message storage.
- Gemini API (`GEMINI_API_KEY`, or encrypted provider settings in the app).
- Meta/Facebook App credentials for Page OAuth and Messenger webhook handling.
- `APP_URL` / `NEXT_PUBLIC_APP_URL` set to the deployed HTTPS origin.

## Facebook webhook

- Verification: `GET /api/webhook`
- Messages: `POST /api/webhook`
- Page subscription fields: `messages,messaging_postbacks`

## Production

Production is deployed from the `main` branch. Any commit to `main` should trigger the connected Vercel project deployment.

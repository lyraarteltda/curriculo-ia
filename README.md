# Currículo IA

Gerador de currículos personalizados com IA — cole a descrição da vaga e sua experiência, receba um currículo sob medida

## Stack

- **Hosting**: Netlify
- **Database**: Supabase (PostgreSQL + RLS)
- **AI**: BYOK (Bring Your Own Key) — users provide their own API keys
- **Community**: Maestria da IA (Circle)

## Access

This tool is exclusive to paying members of Maestria da IA. Users must verify their membership with the email and WhatsApp number used at purchase.

## BYOK (Bring Your Own Key)

This tool uses AI services powered by YOUR API key. Your key is stored only in your browser's localStorage and is never sent to our servers. You can clear your keys at any time from the settings menu.

## Local Development

```bash
npx serve .
```

Open `http://localhost:3000` in your browser.

## Security

- Supabase Row-Level Security (RLS) enabled on all tables
- No server-side storage of user API keys
- CORS restricted to production domain
- CSP headers configured in `netlify.toml`
- LGPD compliant

## Built by

APP-BUILDER-01 — Autonomous Solution Builder for Maestria da IA

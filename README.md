# 🛡 SlapSafe

**Check your app for leaks before you launch.**
A pre-launch security scan that runs on *your* machine. Your code never leaves it.

[slapsafe.com](https://slapsafe.com) · support: jessyka@slapforge.com

In 2026, ~70% of Lovable apps shipped with Row Level Security off, and roughly
1 in 9 vibe-coded apps leaked their Supabase keys. Most "my app leaked user data"
stories come down to three mistakes. SlapSafe catches them in seconds.

## Quick start

You need [Node.js](https://nodejs.org) and your SlapSafe license key (you get the
key when you buy at [slapsafe.com](https://slapsafe.com) — $5, one-time).

```bash
# in your project folder:
npx github:Onefailatatime/slapsafe

# it asks for your key the first time, then remembers it.
# scan a specific folder:
npx github:Onefailatatime/slapsafe ./my-app
```

That's it. You'll get a severity-ranked report of anything that would leak — with
the exact file, line, why it matters, and how to fix it. It exits non-zero on
anything critical, so it drops into CI too.

Manage your key:

```bash
npx github:Onefailatatime/slapsafe --key SS1-XXXX-XXXX   # set or replace your key
npx github:Onefailatatime/slapsafe --logout              # forget the stored key
```

## What it checks
1. **Hardcoded secrets** — Supabase `service_role`, Stripe `sk_live`/`rk_live`,
   OpenAI/Anthropic/AWS/Google keys, private key blocks.
2. **A service_role / admin key shipped to the browser** — the most common cause
   of total database exposure.
3. **`.env` files that aren't gitignored** — so they don't get committed with your secrets.

Plus the buyer doc pack: deep-audit prompts for Claude Code / Cursor, a 1-page
pre-launch checklist, and a key-rotation runbook for when a secret already went out.

## How it works
`npx github:Onefailatatime/slapsafe` is a tiny launcher. It checks your license key, pulls the scanner
from slapsafe.com, and runs it **locally** against your code. Only your key is
ever sent — never your code. If a "security" tool asks you to upload your repo to
scan it for leaks, that's the risk.

## Honest limits
This is a fast heuristic scan, not a full penetration test. It catches the
high-frequency mistakes behind real breaches. For database-level rules (RLS), use
the included prompt pack against your own project.

## Support & refunds
Questions, or a false positive to report? Email **jessyka@slapforge.com**. If it
doesn't help, email within 14 days for a full refund. No forms.

## License
Personal/commercial use on your own projects. See `LICENSE.txt`. Don't resell,
redistribute, or share your key.

---
© 2026 SlapForge · [slapsafe.com](https://slapsafe.com) · A product in the Slap Forge family.

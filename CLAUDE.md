# CLAUDE.md

This is a Model Context Protocol (MCP) server for Binance Futures.

## Quick Start

```bash
npm install
npm run dev
```

## Architecture

- Domain-driven: `src/domain/futures/` (public + authenticated tools), `src/domain/indicators/` (technical indicators)
- Conditional registration: if `BINANCE_API_KEY` + `BINANCE_API_SECRET` are set, authenticated trading tools become available
- Zod schemas auto-generate JSON Schema for MCP tool input validation

## Key Commands

- `npm run dev` — Run with tsx (development)
- `npm run build` — Compile TypeScript
- `npm start` — Run compiled output
- `npm run typecheck` — Type checking only
- `npm run lint` — ESLint
- `npx tsx test/smoke-test.ts` — Smoke test

## Tool Stats

- Public futures tools: 11
- Authenticated futures tools: 19
- Technical indicators: 46 (trend=12, momentum=11, volatility=5, utility=9, signals=4, risk=5)
- Total: 76 with API Key / 57 without

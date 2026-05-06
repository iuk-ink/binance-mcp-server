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
- Authenticated futures tools: 20
- Technical indicators: 53 (trend=13, momentum=14, volatility=8, utility=9, signals=4, risk=5)
- Total: 84 with API Key / 64 without

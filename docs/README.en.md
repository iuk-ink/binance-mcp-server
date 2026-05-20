# Binance MCP Server

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](../LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-≥18-green)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-blue)](https://www.typescriptlang.org/)
[![MCP SDK](https://img.shields.io/badge/MCP_SDK-1.29-purple)](https://modelcontextprotocol.io/)

🌐 **Language:** [English](README.en.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [简体中文](../README.md)

A **Binance Futures API server** built on Model Context Protocol (MCP) — 76 tools covering market data, order execution, and technical indicators.

## Quick Start

- **Prerequisites:** Node.js >= 18
- **API Key:** Optional (market data + indicators without it, trading requires it)

```bash
npm install
cp .env.example .env
npm run dev   # or: npm run build && npm start
```

## Tools Overview (76 total)

### Futures Public (11 tools, no Key required)

| Tool | Function |
|------|------|
| `futures_ping` | Connectivity test |
| `futures_time` | Server time |
| `futures_exchange_info` | Trading rules / fees / min order size |
| `futures_orderbook` | Order book depth |
| `futures_klines` | K-line data (1m ~ 1M) |
| `futures_agg_trades` | Aggregate trades (pagination + time range) |
| `futures_trades` | Recent tick trades |
| `futures_daily_stats` | 24-hour statistics |
| `futures_prices` | All market real-time prices |
| `futures_all_book_tickers` | Best bid/ask for all symbols |
| `futures_mark_price` | Mark price (liquidation basis) |

### Futures Authenticated (19 tools, Key required)

| Category | Tool | Function |
|------|------|------|
| 🏦 Account | `futures_account_balance` | Account balance |
| | `futures_income` | Income history (funding/PnL/commission) |
| | `futures_user_trades` | Trade history |
| ⚙️ Leverage & Margin | `futures_leverage` | Set leverage 1-125x |
| | `futures_margin_type` | Switch ISOLATED / CROSSED |
| | `futures_position_margin` | Add/reduce isolated margin |
| | `futures_margin_history` | Margin change records |
| 📊 Leverage Bracket | `futures_leverage_bracket` | Notional leverage tier table (⚠️ pass symbol recommended) |
| 📝 Orders | `futures_order` | Place order (7 types) |
| | `futures_update_order` | Modify order (pass side+type recommended) |
| | `futures_get_order` | Query single order |
| | `futures_all_orders` | All orders (including history) |
| | `futures_batch_orders` | Batch orders (≤5) |
| | `futures_cancel_batch_orders` | Batch cancel |
| ❌ Cancel & Active | `futures_cancel_order` | Cancel single (supports algoId) |
| | `futures_cancel_all_open_orders` | Cancel all open orders (requires confirmation) |
| | `futures_open_orders` | Current open orders (incl. conditional orders) |
| 🛠️ Utilities | `futures_account_report` | Account overview (compact/full configurable) |
| | `futures_quick_order` | One-click stop loss / take profit (auto-calculates trigger price) |

#### Order Type Cheat Sheet

| type | Use Case | Required Params | Close Position |
|------|------|------|------|
| `MARKET` | Market open/close | `quantity` | SELL+LONG auto reduceOnly |
| `LIMIT` | Limit order | `price`, `quantity` | Same as above |
| `STOP_MARKET` | Market stop loss | `stopPrice` | `closePosition=true` |
| `TAKE_PROFIT_MARKET` | Market take profit | `stopPrice` | `closePosition=true` |
| `TRAILING_STOP_MARKET` | Trailing stop | `activationPrice`, `callbackRate` | `closePosition=true` |
| `STOP` | Limit stop loss | `price`, `stopPrice` | `closePosition=true` |

#### Close Position Cheat Sheet

| Scenario | Parameters |
|------|------|
| Market close all positions | `side=SELL, positionSide=LONG, type=MARKET, quantity=position_size` |
| Stop loss close | `type=STOP_MARKET, closePosition=true, stopPrice=trigger_price` |
| Take profit close | `type=TAKE_PROFIT_MARKET, closePosition=true, stopPrice=trigger_price` |
| Trailing stop close | `type=TRAILING_STOP_MARKET, closePosition=true, activationPrice=activation, callbackRate="1"` |
| Cancel conditional order | `futures_cancel_order(symbol, algoId=xxx)` |

### Technical Indicators (46 tools, no Key required)

| Category | Count | Tools |
|------|:--:|------|
| **Trend** | 12 | `indicator_sma`, `indicator_ema`, `indicator_dema`, `indicator_rma`, `indicator_wma`, `indicator_wsma`, `indicator_dma`, `indicator_dx`, `indicator_adx`, `indicator_linreg`, `indicator_psar`, `indicator_vwap` |
| **Momentum** | 11 | `indicator_ao`, `indicator_mom`, `indicator_cci`, `indicator_macd`, `indicator_obv`, `indicator_roc`, `indicator_rsi`, `indicator_stoch`, `indicator_stoch_rsi`, `indicator_tds`, `indicator_williams_r` |
| **Volatility** | 5 | `indicator_abands`, `indicator_atr`, `indicator_bbands`, `indicator_iqr`, `indicator_zigzag` |
| **Utility** | 9 | `util_average`, `util_grid`, `util_max`, `util_min`, `util_median`, `util_quartile`, `util_stddev`, `util_streaks`, `util_weekday` |
| **Signals** | 4 | `signal_ema_cross`, `signal_macd_rsi`, `signal_bb_rsi`, `signal_ma_cross` |
| **Risk** | 5 | `util_sharpe`, `util_max_drawdown`, `util_calmar`, `util_win_rate`, `util_var` |

## Environment Configuration

| Variable | Required | Description |
|------|:--:|------|
| `BINANCE_API_KEY` | No | Binance API key |
| `BINANCE_API_SECRET` | No | Binance API secret |
| `BINANCE_TESTNET` | No | Testnet switch, default `true` |
| `HTTP_FUTURES_BASE` | No | Futures endpoint, auto-selects based on testnet |
| `HTTP_PROXY` | No | HTTP proxy, e.g. `http://user:pass@host:8080` |
| `MCP_SERVER_NAME` | No | Server name, default `binance-mcp-server` |
| `LOG_LEVEL` | No | Log level: `debug` / `info` / `warn` / `error` |

### Env Variable Priority

```
MCP config env block  >  .env file  >  code defaults
```

The `env` block in MCP config files (e.g. `mcp.json`) has the highest priority, with `.env` as fallback. dotenv **will not override** already-set environment variables.

> **Security tip:** Use the MCP config `env` block for keys, keep `.env` values empty.

## Configure AI Assistant

> **Note:** MCP config files are not in your project directory — **absolute paths are required**. Examples assume the project is at `E:/Github/I-binance-mcp`.

### Prerequisite: Build first

```bash
npm run build
```

### Cursor / Trae / OpenCode

```json
{
  "mcpServers": {
    "binance": {
      "command": "node",
      "args": ["E:/Github/I-binance-mcp/dist/index.js"],
      "env": {
        "BINANCE_API_KEY": "your_key",
        "BINANCE_API_SECRET": "your_secret",
        "BINANCE_TESTNET": "true"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add binance -- node E:/Github/I-binance-mcp/dist/index.js
```

## Architecture

```
src/
├── index.ts              ← Entry point
├── server.ts             ← McpServer creation + conditional registration
├── config/binance.ts     ← Config (endpoint / proxy / auth)
├── types/common.ts       ← ToolDefinition + BinanceClient types
├── utils/                ← Response factory / logger / validation / sanitization / rate limiter
└── domain/
    ├── futures/          ← Futures: public (11) + authenticated (19)
    │   ├── schemas.ts    ← Zod Schema (aggregated export)
    │   ├── schemas/
    │   │   ├── public.ts     ← Public schemas (10)
    │   │   └── authenticated.ts ← Auth schemas (18)
    │   ├── public.ts     ← Public handlers
    │   ├── authenticated.ts ← Auth handlers
    │   └── index.ts
    └── indicators/       ← Technical indicators (46)
        ├── schemas.ts    ← Indicator param schemas
        ├── format.ts     ← Precision formatter
        ├── trend.ts (12) / momentum.ts (11)
        ├── volatility.ts (5) / utility.ts (9)
        ├── signals.ts (4) / risk.ts (5)
        └── index.ts
```

**Conditional registration:** API Key present → 76 tools; absent → 57 tools.

## Commands

| Command | Description |
|------|------|
| `npm run dev` | Dev mode (tsx) |
| `npm run build` | Compile |
| `npm start` | Run compiled output |
| `npm run typecheck` | Type checking |
| `npm run watch` | Hot reload |
| `npx tsx test/smoke-test.ts` | Smoke test (30 items) |

## Tech Stack

| Component | Version | Purpose |
|------|------|------|
| `@modelcontextprotocol/sdk` | ^1.29 | MCP framework (`registerTool`) |
| `binance-api-node` | ^0.13 | Binance API client |
| `trading-signals` | ^7.4 | Technical indicator computation |
| `zod` | ^4.4 | Schema → JSON Schema auto-generation |
| `dotenv` | ^17.4 | Environment variables |
| `typescript` | ^6.0 | Primary language |

## Security

- Keys injected via environment variables only, never in code or logs
- Error messages auto-sanitized (`api_key` → `[API_KEY]`, `signature` → `[SIGNATURE]`)
- `STOP_MARKET` / `TAKE_PROFIT_MARKET` auto-send `closePosition` explicitly (prevents `undefined` from being dropped by JSON)
- Hedge mode `SELL+LONG` auto-sets `reduceOnly=true` to prevent accidental reverse positions
- Always test trading features with `BINANCE_TESTNET=true`
- Set `LOG_LEVEL=error` in production

## License

MIT

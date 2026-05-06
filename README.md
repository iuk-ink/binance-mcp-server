# Binance MCP Server

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-≥18-green)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-blue)](https://www.typescriptlang.org/)
[![MCP SDK](https://img.shields.io/badge/MCP_SDK-1.29-purple)](https://modelcontextprotocol.io/)

🌐 **Language:** [English](docs/README.en.md) | [日本語](docs/README.ja.md) | [한국어](docs/README.ko.md) | 简体中文

基于 Model Context Protocol (MCP) 的 **Binance 合约 API 服务器**，为 AI 助手（Claude Code、Cursor、Trae、OpenCode 等）提供实时行情、交易下单和技术指标计算能力。

## 快速开始

- **环境：** Node.js >= 18
- **API Key：** 可选（不配只给行情和指标，配了才有下单）

```bash
npm install
cp .env.example .env
npm run dev   # 或：npm run build && npm start
```

## 工具全景（72 个）

### 期货公开（11 个，无需 Key）

| 工具 | 功能 |
|------|------|
| `futures_ping` | 连通性测试 |
| `futures_time` | 服务器时间 |
| `futures_exchange_info` | 交易规则 / 费率 / 最小下单量 |
| `futures_orderbook` | 订单簿深度 |
| `futures_klines` | K 线数据（1m ~ 1M） |
| `futures_agg_trades` | 聚合成交（分页+时间范围） |
| `futures_trades` | 最新逐笔成交 |
| `futures_daily_stats` | 24 小时统计 |
| `futures_prices` | 全市场实时价 |
| `futures_all_book_tickers` | 最优买卖挂单 |
| `futures_mark_price` | 标记价格（强平依据） |

### 期货认证（17 个，需要 API Key）

| 分类 | 工具 | 功能 |
|------|------|------|
| 🏦 账户查询 | `futures_account_balance` | 账户余额 |
| | `futures_income` | 收益流水（费率/盈亏/佣金） |
| | `futures_user_trades` | 成交历史 |
| ⚙️ 杠杆与保证金 | `futures_leverage` | 调整杠杆 1-125x |
| | `futures_margin_type` | 逐仓/全仓切换 |
| | `futures_position_margin` | 逐仓保证金调增/调减 |
| | `futures_margin_history` | 保证金变更记录 |
| 📊 杠杆分层 | `futures_leverage_bracket` | 名义仓位杠杆阶梯 |
| 📝 下单与改单 | `futures_order` | 下单（7 种类型） |
| | `futures_update_order` | 修改订单 |
| | `futures_get_order` | 查单 |
| | `futures_all_orders` | 全量订单（含历史） |
| | `futures_batch_orders` | 批量下单（≤5） |
| | `futures_cancel_batch_orders` | 批量取消 |
| ❌ 取消与活跃 | `futures_cancel_order` | 单笔取消（支持条件单 algoId） |
| | `futures_cancel_all_open_orders` | 一键清仓 |
| | `futures_open_orders` | 当前活跃订单 |

#### 下单类型速查表

| type | 用途 | 必需参数 | 平仓方式 |
|------|------|------|------|
| `MARKET` | 市价开平 | `quantity` | SELL+LONG 自动 reduceOnly |
| `LIMIT` | 限价挂单 | `price`, `quantity` | 同上 |
| `STOP_MARKET` | 市价止损 | `stopPrice` | `closePosition=true` |
| `TAKE_PROFIT_MARKET` | 市价止盈 | `stopPrice` | `closePosition=true` |
| `TRAILING_STOP_MARKET` | 追踪止损 | `activationPrice`, `callbackRate` | `closePosition=true` |
| `STOP` | 限价止损 | `price`, `stopPrice` | `closePosition=true` |

#### 平仓速查表

| 场景 | 参数组合 |
|------|------|
| 市价平掉全部持仓 | `side=SELL, positionSide=LONG, type=MARKET, quantity=持仓数` |
| 止损平仓 | `type=STOP_MARKET, closePosition=true, stopPrice=触发价` |
| 止盈平仓 | `type=TAKE_PROFIT_MARKET, closePosition=true, stopPrice=触发价` |
| 追踪止损平仓 | `type=TRAILING_STOP_MARKET, closePosition=true, activationPrice=激活价, callbackRate="1"` |
| 取消条件单 | `futures_cancel_order(symbol, algoId=xxx)` |

### 技术指标（44 个，无需 Key）

| 分类 | 数量 | 工具列表 |
|------|:--:|------|
| **趋势** | 13 | `indicator_sma`, `indicator_ema`, `indicator_dema`, `indicator_rma`, `indicator_wma`, `indicator_wsma`, `indicator_sma15`, `indicator_dma`, `indicator_dx`, `indicator_adx`, `indicator_linreg`, `indicator_psar`, `indicator_vwap` |
| **动量** | 14 | `indicator_ao`, `indicator_ac`, `indicator_mom`, `indicator_cci`, `indicator_cg`, `indicator_macd`, `indicator_obv`, `indicator_rei`, `indicator_roc`, `indicator_rsi`, `indicator_stoch`, `indicator_stoch_rsi`, `indicator_tds`, `indicator_williams_r` |
| **波动率** | 8 | `indicator_abands`, `indicator_atr`, `indicator_bbands`, `indicator_bbw`, `indicator_iqr`, `indicator_mad`, `indicator_tr`, `indicator_zigzag` |
| **工具函数** | 9 | `util_average`, `util_grid`, `util_max`, `util_min`, `util_median`, `util_quartile`, `util_stddev`, `util_streaks`, `util_weekday` |

## 环境配置

| 变量 | 必填 | 说明 |
|------|:--:|------|
| `BINANCE_API_KEY` | 否 | 币安 API 密钥 |
| `BINANCE_API_SECRET` | 否 | 币安 API 私钥 |
| `BINANCE_TESTNET` | 否 | 测试网开关，默认 `true` |
| `HTTP_FUTURES_BASE` | 否 | 期货端点，留空按 testnet 自动切换 |
| `HTTP_PROXY` | 否 | HTTP 代理，如 `http://user:pass@host:8080` |
| `MCP_SERVER_NAME` | 否 | 服务器名，默认 `binance-mcp-server` |
| `LOG_LEVEL` | 否 | 日志级别：`debug` / `info` / `warn` / `error` |

### 环境变量优先级

```
MCP 配置 env 块  >  .env 文件  >  代码默认值
```

MCP 配置文件（如 `mcp.json`）里设的 `env` 优先级最高，`.env` 兜底。dotenv **不会覆盖** 进程已存在的环境变量。

> **安全建议：** 用 MCP 配置的 `env` 块管理密钥，`.env` 的 Key 值清空。

## 配置 AI 助手

> **注意：** MCP 配置文件不在项目目录，必须用**绝对路径**。以下假设项目在 `E:/Github/I-binance-mcp`，替换为你实际路径。

### 前置：先构建

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

## 架构

```
src/
├── index.ts              ← 入口
├── server.ts             ← McpServer 创建 + 条件注册
├── config/binance.ts     ← 配置（端点 / 代理 / 认证）
├── types/common.ts       ← ToolDefinition 泛型
├── utils/                ← 日志 / 校验 / 错误脱敏
└── domain/
    ├── futures/          ← 期货：公开(12) + 认证(17)
    │   ├── schemas.ts    ← Zod Schema（42 个输入定义）
    │   ├── public.ts     ← 公开 handler
    │   ├── authenticated.ts ← 认证 handler
    │   └── index.ts
    └── indicators/       ← 技术指标(44)
        ├── schemas.ts    ← 指标参数 Schema
        ├── trend.ts (13) / momentum.ts (14)
        ├── volatility.ts (8) / utility.ts (9)
        └── index.ts
```

**条件注册：** API Key 存在 → 72 工具；不存在 → 55 工具。

## 命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 开发模式（tsx） |
| `npm run build` | 编译 |
| `npm start` | 运行编译产物 |
| `npm run typecheck` | 类型检查 |
| `npm run watch` | 热重载 |
| `npx tsx test/smoke-test.ts` | 冒烟测试（31 项） |

## 技术栈

| 组件 | 版本 | 用途 |
|------|------|------|
| `@modelcontextprotocol/sdk` | ^1.29 | MCP 框架（`registerTool`） |
| `binance-api-node` | ^0.13 | 币安 API 客户端 |
| `trading-signals` | ^7.4 | 技术指标计算 |
| `zod` | ^4.4 | Schema → JSON Schema 自动生成 |
| `dotenv` | ^17.4 | 环境变量 |
| `typescript` | ^6.0 | 主语言 |

## 安全

- 密钥仅从环境变量注入，不写入代码或日志
- 错误消息自动脱敏（`api_key` → `[API_KEY]`、`signature` → `[SIGNATURE]`）
- 建议始终在 `BINANCE_TESTNET=true` 模式下测试交易功能
- 生产环境设 `LOG_LEVEL=error`

## 许可证

MIT

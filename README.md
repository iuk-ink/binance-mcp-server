# Binance MCP Server

[![Version](https://img.shields.io/npm/v/@iuk-ink/binance-mcp-server.svg)](https://www.npmjs.com/package/@iuk-ink/binance-mcp-server)
[![Node.js](https://img.shields.io/badge/node.js-%3E%3D20-green.svg)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

基于 [Model Context Protocol](https://modelcontextprotocol.io) 的 Binance U 本位期货 MCP 服务器，为 AI 助手提供 **61 个** MCP 工具，覆盖行情数据、技术指标、风险分析与期货交易。

构建于 MCP server v2 SDK 与币安官方 SDK（`@binance/derivatives-trading-usds-futures`）之上，全部数值经交易所精度规则自动规整，含两级行情缓存、-1007 超时幂等恢复与时钟偏差检测。

## 快速开始

### 零配置体验（仅分析，不交易）

```bash
npx @iuk-ink/binance-mcp-server
```

无需 API Key，默认连接测试网，即可使用行情、指标与风险分析工具。

### 配置 MCP Client

```json
{
  "mcpServers": {
    "binance": {
      "command": "npx",
      "args": ["-y", "@iuk-ink/binance-mcp-server"],
      "env": {
        "BINANCE_TESTNET": "true"
      }
    }
  }
}
```

如需交易功能，补充 `BINANCE_API_KEY` 与 `BINANCE_API_SECRET`。

### 环境变量

| 变量 | 必填 | 默认值 | 说明 |
|------|:---:|------|------|
| `BINANCE_TESTNET` | 否 | `true` | 测试网（虚拟金） / 主网 |
| `BINANCE_USE_DEMO` | 否 | `false` | demo 交易环境（与主网凭证共用） |
| `BINANCE_BASE_URL` | 否 | — | 自定义 REST 端点（优先级最高） |
| `BINANCE_API_KEY` | 否 | — | 不填则交易工具不注册 |
| `BINANCE_API_SECRET` | 否 | — | 同上 |
| `BINANCE_PROXY_URL` | 否 | — | HTTP/HTTPS 代理地址 |
| `BINANCE_TIMEOUT` | 否 | `10000` | 请求超时（毫秒） |
| `BINANCE_RETRIES` | 否 | `3` | 网络重试次数 |
| `BINANCE_BACKOFF` | 否 | `1000` | 重试退避基数（毫秒） |
| `BINANCE_RECV_WINDOW` | 否 | `5000` | 签名时间窗（毫秒） |
| `MCP_TOOL_DOMAINS` | 否 | 全部 | 工具域过滤，逗号分隔：`market,trading,indicator,analysis` |
| `MCP_SERVER_NAME` | 否 | `binance-mcp-server` | MCP 服务名 |
| `MCP_TRANSPORT` | 否 | `stdio` | 传输模式：`stdio`（本地）/ `http`（远程，见下节） |
| `MCP_HTTP_HOST` | 否 | `127.0.0.1` | HTTP 模式监听地址（非本机绑定时强制要求令牌） |
| `MCP_HTTP_PORT` | 否 | `3100` | HTTP 模式监听端口 |
| `MCP_HTTP_TOKEN` | 否 | — | HTTP 模式 Bearer 令牌；非本机绑定时**必填** |
| `MCP_HTTP_ALLOWED_HOSTS` | 否 | 自动推导 | HTTP 模式 Host 白名单（逗号分隔）；通配绑定时**必填** |
| `LOG_LEVEL` | 否 | `info` | debug / info / warn / error |

## 远程 / HTTP 接入

默认 stdio 适合本地单客户端（进程被客户端直接启动）。需要**远程部署 / 多客户端共享**时启用 Streamable HTTP。

涉及**两层独立配置**，请务必区分：

- **服务端**（运行 MCP 进程的机器）：用**环境变量**配置监听地址与认证
- **客户端**（AI 助手 / IDE 等连入方）：用 **JSON 配置**指定连接地址与令牌

### 第 1 步：服务端启动（环境变量）

```bash
# 仅本机访问（默认，无需令牌）
MCP_TRANSPORT=http
MCP_HTTP_PORT=3100
npx @iuk-ink/binance-mcp-server

# 对外暴露（必须配令牌认证，否则拒绝启动）
MCP_TRANSPORT=http
MCP_HTTP_HOST=0.0.0.0
MCP_HTTP_PORT=3100
MCP_HTTP_TOKEN=your-long-secret
MCP_HTTP_ALLOWED_HOSTS=your-domain.com
npx @iuk-ink/binance-mcp-server
```

启动后验证服务已就绪：

```bash
curl http://127.0.0.1:3100/health      # 期望 {"ok":true,"uptime":<秒>}
```

### 第 2 步：客户端配置（JSON）

支持 Streamable HTTP 的 MCP 客户端，按「服务端是否设了令牌」二选一：

```json
// 无令牌（仅本机，服务端未设 MCP_HTTP_TOKEN）
{
  "mcpServers": {
    "binance": { "type": "http", "url": "http://127.0.0.1:3100/mcp" }
  }
}

// 有令牌（对外暴露，需在 headers 中回传 Bearer 令牌）
{
  "mcpServers": {
    "binance": {
      "type": "http",
      "url": "http://your-server:3100/mcp",
      "headers": { "Authorization": "Bearer your-long-secret" }
    }
  }
}
```

> **常见误区**：服务端的 `MCP_HTTP_*` 环境变量作用域仅限服务端进程。客户端无法通过 JSON 配置这些变量来配置服务器——JSON 只管「连到哪 + 带什么认证头」。

### 安全须知（交易服务器暴露 = 任何能连接的客户端都可用你的凭证交易）

- 默认仅监听 `127.0.0.1`（本机），无需令牌
- 绑定非本机地址时**必须**设置 `MCP_HTTP_TOKEN`（Bearer 认证），否则拒绝启动
- 通配绑定（`0.0.0.0`）时**必须**设置 `MCP_HTTP_ALLOWED_HOSTS`（Host 白名单，DNS rebinding 防护）
- 公网部署强烈建议：令牌 + 反向代理 TLS（nginx / Caddy），且令牌应足够长且随机
- 行情缓存跨请求共享（常驻进程），等价于多客户端复用一个服务实例，注意同一服务实例上的**所有客户端共享同一组币安凭证与风控额度**

## 工具清单（61 个，主网）

测试网下 57 个（4 个情绪端点仅主网可用，不注册）。

### 市场数据（18）

| 工具 | 说明 |
|------|------|
| `market_price` | 最新成交价 |
| `market_book_ticker` | 最优买卖报价+量（比 orderbook 轻量得多） |
| `market_orderbook` | 订单簿多档深度（5/10/20/50/100/500/1000） |
| `market_klines` | K 线历史数据 |
| `market_24hr_ticker` | 24h 涨跌幅 / 最高 / 最低 / 成交量 |
| `market_mark_price` | 标记价（= 清算参考价，含资金费率） |
| `market_open_interest` | 未平仓合约量（OI） |
| `market_funding_rate` | 当前资金费率与上下限 |
| `market_funding_rate_history` | 历史资金费率 |
| `market_continuous_klines` | 永续 / 当季 / 次季连续合约 K 线（基差分析） |
| `market_exchange_info` | 交易规则 / 精度 / 最小下单量 |
| `market_overview` | 一站式快照：行情 + 指标 + 资金费率 + 盘口，单次调用 |
| `market_ping` / `market_time` | 连通性测试 / 服务器时钟校准 |
| `market_open_interest_hist` | OI 历史统计（仅主网） |
| `market_long_short_ratio` | 全账户多空比（仅主网） |
| `market_taker_volume` | 主动买卖量比（仅主网） |
| `market_top_trader_ratio` | 大户持仓多空比（仅主网） |

### 技术指标（19）

直连设计：一步完成「拉取 K 线 → 计算指标」，无需先调 `market_klines`。

| 类别 | 工具 |
|------|------|
| 趋势 | `indicator_sma` / `indicator_ema` / `indicator_macd` / `indicator_adx` / `indicator_super_trend` / `indicator_vwap` |
| 动量 | `indicator_rsi` / `indicator_stoch` / `indicator_cci` / `indicator_mfi` / `indicator_obv` |
| 波动 | `indicator_atr` / `indicator_bbands` / `indicator_volatility_regime` |
| 组合信号 | `indicator_ma_cross`（均线交叉）/ `indicator_macd_rsi` / `indicator_bb_rsi` / `indicator_divergence`（RSI 背离） |
| 批量 | `indicator_multi`（一次调用 = RSI + MACD + BBands + 可选 ATR / ADX / Stoch） |

### 风险分析（3）

| 工具 | 说明 |
|------|------|
| `analysis_sharpe` | Sharpe + Sortino + 年化收益 / 波动（按 K 线周期自动推断年化系数） |
| `analysis_drawdown` | 最大回撤（含峰谷价位与位置） |
| `analysis_var` | VaR / CVaR（置信度 0.5~0.99 可调） |

### 期货交易（21，需 API Key）

| 分类 | 工具 |
|------|------|
| 账户 | `trading_balance` / `trading_account` / `trading_positions` / `trading_income` / `trading_commission` |
| 订单 | `trading_place_order`（含 dryRun 演练）/ `trading_place_algo`（止损 / 止盈 / 追踪止损）/ `trading_modify_order` / `trading_cancel_order` / `trading_cancel_algo` / `trading_cancel_all` |
| 查询 | `trading_get_order` / `trading_open_orders` / `trading_order_history` / `trading_trades` / `trading_force_orders` / `trading_algo_orders` |
| 配置 | `trading_set_leverage` / `trading_set_margin_type` / `trading_position_margin` / `trading_position_mode` |

下单自动完成：价格 / 数量精度向下规整（tickSize / stepSize）、最小名义价值校验、`-1007` 撮合超时后以幂等订单号查证成交状态再决定是否重试。

## 特性亮点

- `market_overview` 一站式快照（单次调用聚合行情 / 指标 / 资金 / 盘口）
- 多协议接入：本地 stdio 直启，或 Streamable HTTP 远程部署 / 多客户端共享
- `MCP_TOOL_DOMAINS` 工具域过滤、`BINANCE_USE_DEMO` / `BINANCE_BASE_URL` 环境切换
- 两级缓存（exchangeInfo 5min + K 线 3s，飞行中去重）
- `-1007` 撮合超时幂等恢复、时钟偏差启动检测
- 下单精度自动规整 + 最小名义价值前置校验
- 参数校验全面对齐官方约束（clientOrderId 字符集、GTD 上界、追踪止损回撤率 0.1~10 等）

## AI 使用指南（Skill）

仓库内置 [`skills/binance-trader/SKILL.md`](skills/binance-trader/SKILL.md)——为 AI 助手编写的使用手册，涵盖工具选择决策、跨工具工作流、交易安全纪律与错误恢复剧本。支持 Skill 机制的客户端（Claude Code / Trae 等）可直接挂载，让 AI 从"能用工具"升级为"用好工具"。

## 本地开发

```bash
git clone https://github.com/iuk-ink/binance-mcp-server
cd binance-mcp-server
npm install
```

### 命令

| 命令 | 用途 |
|------|------|
| `npm run dev` | tsx 直接启动，开发时使用 |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm test` | node:test 运行全部 196 个测试（无网络依赖） |
| `npm run build` | 编译到 `dist/` |
| `npm start` | 运行编译产物 |

## License

MIT

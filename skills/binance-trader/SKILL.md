---
name: binance-trader
description: 币安 U 本位期货 MCP（binance-mcp-server）使用手册。前置依赖：须先安装 @iuk-ink/binance-mcp-server MCP 服务器。当用户需要加密货币行情分析、技术指标计算、风险量化评估或期货交易执行（下单/撤单/持仓管理/条件单）时使用。涵盖安装自检、工具选择决策、跨工具工作流、交易安全纪律与常见错误恢复剧本。
metadata:
  version: "3.1.0"
---

# Binance 期货交易指南

面向 AI 助手的 binance-mcp-server 使用知识。只覆盖工具描述装不下的内容（安装自检、工具选择、跨工具编排、安全纪律、错误恢复），参数约束与合法值一律以各工具自带描述为准，不在此复述。

## 前置条件（先读）

本手册涉及的全部工具来自 **binance-mcp-server** MCP 服务器（npm 包 `@iuk-ink/binance-mcp-server`）。只安装本 skill 而未接入该 MCP 时，任何工具调用都会失败——此时**不要**反复尝试工具或编造数据，应引导用户安装。

**开始前自检**：首次为本用户服务时，先确认工具可用——调用一次 `market_ping`（最轻量只读探测）或查看可用工具列表是否包含 `market_*` 系列：

- 探测成功 → 按后续章节正常工作
- 工具不存在 → 停止一切工具调用，向用户说明需安装 MCP 服务器，并给出以下配置（加入 MCP 客户端的 `mcpServers` 配置后重启客户端）：

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

需要交易功能时在 `env` 补充 `BINANCE_API_KEY` 与 `BINANCE_API_SECRET`；默认测试网（虚拟金）零资金风险。

**接入方式选择**：本地单客户端用上面的 stdio 配置（`command` + `args`）；远程部署 / 多客户端共享用下方 HTTP 配置。两种方式工具行为完全一致，仅客户端配置形态不同——按用户环境二选一即可。

```json
{
  "mcpServers": {
    "binance": {
      "type": "http",
      "url": "http://<host>:3100/mcp"
    }
  }
}
```

**远程部署变体**：若服务器对外暴露并设了 `MCP_HTTP_TOKEN`，需在 HTTP 配置的 `headers` 中回传 Bearer 令牌（`"headers": { "Authorization": "Bearer <token>" }`）。

## 环境认知

| 事实 | 含义 |
|---|---|
| 默认连接测试网（虚拟金） | 未配置凭证即可全功能试用，交易操作零资金风险；切主网需 `BINANCE_TESTNET=false` + API 凭证 |
| 情绪端点仅主网注册 | OI 历史 / 多空比 / 主动买卖量 / 大户持仓 4 个工具在测试网不存在，属正常裁剪而非故障 |
| trading 域依赖凭证 | 无凭证时 21 个交易工具不注册（调用报 unknown tool 属正常），行情 / 指标 / 风险分析不受影响 |
| 指标返回条数 < limit 属正常 | 每个指标按自身预热需求跳过前若干根（如 limit=200 时 SMA(20) 返回 181 条），不是数据缺失 |
| 个别工具域整体缺失 | 若 `market_*` 存在但某域全缺：trading 缺 = 未配凭证；多域缺 = 用户的 `MCP_TOOL_DOMAINS` 环境变量过滤了域，提示用户检查该配置 |

## 工具选择树

**行情查询——按轻重分流**：

- 只要最新价 → `market_price`；要最优买卖价 → `market_book_ticker`（比深度盘轻量得多）
- 要盘口深度 / 大单分布 → `market_orderbook`
- 综合体检（推荐起手）→ `market_overview`：单次调用 = 行情 + 六指标 + 资金费率 + 盘口
- 跨期基差分析 → `market_continuous_klines`（永续 / 当季 / 次季对比）

**技术指标**：

- 只要 1 个指标 → 对应 `indicator_*` 单工具
- 要 2 个以上 → `indicator_multi`（单次 K 线拉取计算多个指标，省网络往返）
- 判断趋势转折 → `indicator_ma_cross`（均线交叉）+ `indicator_divergence`（RSI 背离）组合使用

**交易查询**：

- 订单详情 → `trading_get_order`，orderId 与 clientOrderId 双渠道均可；改单 / 撤单后 orderId 不变、clientOrderId 保留，两种方式都能查到终态
- 持仓模式 → `trading_position_mode`：**不传参即纯查询**，传 `dual` 才执行切换——仅需了解模式时切勿带参调用

## 标准工作流

### 行情分析流

```
market_overview（起手快照）
  ├─ 高波动 / 超买超卖信号 → indicator_volatility_regime 下钻波动状态
  ├─ 趋势存疑 → indicator_divergence（背离）/ indicator_ma_cross（交叉）
  └─ 资金面 → market_funding_rate_history（费率极值 = 杠杆拥挤度）
```

### 交易执行流（核心闭环）

```
1. trading_position_mode            # 查持仓模式：单向省略 positionSide，双向必传
2. trading_place_order dryRun=true  # 参数演练：精度规整 + 最小名义价值全走真实校验
3. trading_place_order              # dryRun 通过后实单
4. trading_place_algo               # 立即挂止损 / 止盈保护仓位
5. trading_get_order                # 需要时查证订单终态
```

### 风险巡检流

```
trading_positions → trading_account → （策略层面）analysis_drawdown / analysis_sharpe
持仓与浮动盈亏      保证金健康度        历史收益与回撤质量
```

账户风险信号：`availableBalance` 相对持仓保证金偏低、未实现亏损持续扩大 → 考虑减仓、补保证金或收紧止损。

## 安全纪律

1. **dryRun 先行**：新参数 / 新交易对首次下单必须先 `dryRun=true`——演练会走完整校验链，通过即代表实单参数必然合法（方向性错误除外）
2. **测试网先行**：新策略先在默认测试网跑通完整闭环，确认执行流无误后再切主网
3. **成交必挂保护**：市价成交后立即用 `trading_place_algo` 挂止损；追踪止损回撤率参考波动状态——squeeze（低波动）配小回撤易被噪音扫损，expansion（高波动）需给足回撤空间
4. **改杠杆前查持仓**：`trading_set_leverage` 对已有持仓立即生效，操作前先 `trading_positions` 确认当前敞口
5. **-1007 严禁手动重试**：撮合超时已由服务端内置幂等查证（自动确认订单是否成交）；AI 重复下单等于双倍仓位风险——等结果返回或用 `trading_get_order` 查证即可

## 错误恢复剧本

| 症状 | 处置动作 |
|---|---|
| 工具不存在 / unknown tool | 先按「前置条件」自检分辨病因：全部工具缺失 = MCP 未安装（引导安装）；仅 trading 缺 = 未配凭证（正常）；多域缺失 = `MCP_TOOL_DOMAINS` 过滤。**严禁**在工具缺失时编造数据回应行情 / 交易类问题 |
| `-2021` Order would immediately trigger | 触发价方向错误：先 `market_price` 取现价，按止损 / 止盈方向规则修正触发价（方向规则见 `trading_place_algo` 工具描述） |
| `-4061` 持仓模式冲突 | `trading_position_mode` 查当前模式后修正参数：单向省略 positionSide，双向必传 LONG / SHORT |
| 名义价值低于最小限制 | 数量 × 价格不足门槛（如 BTCUSDT 测试网约 50 USDT）：加大数量或调整价格后重试 |
| `No need to change margin type` | 非错误，官方幂等响应——目标模式已是当前模式，无需任何处理 |
| `Add margin only support for isolated position` | 全仓模式下不可调逐仓保证金：先 `trading_set_margin_type` 切 ISOLATED 再操作 |
| `-1021` 时间窗超出 / 启动时钟偏差告警 | 本机时钟与交易所偏差过大，多为**间歇性**（时钟偏差 + 偶发链路延迟叠加）：可**重试一次**；若持续失败再校准系统时间（NTP 同步）。服务端代码无需改动 |

/**
 * 工具聚合层 — 上下文与工具定义组装入口
 *
 * {@link ToolContext} 持有服务实例与配置，供各领域工具定义消费；
 * {@link buildToolDefs} 按配置条件注册：`MCP_TOOL_DOMAINS` 域过滤、
 * 仅配置凭证时注册交易域、非主网（测试网 / demo）跳过情绪类行情（与域开关正交）。
 *
 * @module tools
 */

import type { BinanceConfig, ToolDomain } from "../config/schema.js";
import type { AccountService } from "../exchange/account.js";
import type { MarketService } from "../exchange/market.js";
import type { TradeService } from "../exchange/trade.js";
import type { ToolDef } from "../mcp/types.js";
import { buildAnalysisToolDefs } from "./analysis.tools.js";
import { buildIndicatorToolDefs } from "./indicator.tools.js";
import { buildMarketOverviewToolDef } from "./market.overview.tools.js";
import { buildMarketToolDefs } from "./market.tools.js";
import { buildTradingToolDefs } from "./trading.tools.js";

/** 工具层上下文：服务实例 + 配置 */
export interface ToolContext {
  /** 全局配置 */
  config: Readonly<BinanceConfig>;
  /** 行情服务（无需凭证） */
  market: MarketService;
  /** 账户服务（仅配置凭证时存在） */
  account?: AccountService;
  /** 交易服务（仅配置凭证时存在） */
  trade?: TradeService;
}

/**
 * 组装全部工具定义
 *
 * - 按配置的 {@link ToolDomain} 过滤各域工具
 * - 交易域额外受凭证约束：仅当配置币安凭证时注册
 * - 行情域的情绪端点仅主网注册（非主网跳过，与其域开关正交）
 *
 * @param ctx - 工具上下文
 * @returns 工具定义列表
 */
export function buildToolDefs(ctx: ToolContext): ToolDef[] {
  const { enabledToolDomains } = ctx.config;
  const enabled = (domain: ToolDomain): boolean => enabledToolDomains.includes(domain);

  const defs: ToolDef[] = [];
  if (enabled("market")) {
    defs.push(...buildMarketToolDefs(ctx));
    defs.push(buildMarketOverviewToolDef(ctx));
  }
  if (enabled("indicator")) {
    defs.push(...buildIndicatorToolDefs(ctx));
  }
  if (enabled("analysis")) {
    defs.push(...buildAnalysisToolDefs(ctx));
  }
  if (enabled("trading") && ctx.account && ctx.trade) {
    defs.push(...buildTradingToolDefs(ctx));
  }
  return defs;
}

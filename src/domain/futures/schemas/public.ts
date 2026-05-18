/**
 * Binance MCP Server — 期货公开工具 Zod Schema 定义
 *
 * @module domain/futures/schemas/public
 * @description
 * 定义所有期货公开 MCP 工具的输入参数 Zod Schema，共 10 个。
 * 每个 Schema 使用 z.object({}).describe() 为字段附加 AI 可读的描述文本，
 * McpServer.registerTool() 会自动将 Zod Schema 转为 JSON Schema。
 */

import { z } from 'zod';

/**
 * 期货交易对符号基础 Schema
 * 空对象，用于无参工具（如 futures_ping、futures_account_balance）
 */
export const FuturesSymbolSchema = z.object({});

/**
 * 期货 K 线数据参数
 *
 * interval 支持 15 种标准 K 线周期（1 分钟到 1 月）。
 * limit 默认 500，Binance API 限制最大 1500。
 */
export const FuturesKlinesSchema = z.object({
  symbol: z.string().describe('交易对符号，如 BTCUSDT'),
  interval: z
    .enum(['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '3d', '1w', '1M'])
    .describe('K线时间间隔'),
  limit: z.number().min(1).max(1500).optional().default(500).describe('数量限制，默认500'),
});

/**
 * 期货订单簿深度参数
 *
 * limit 控制买卖盘各返回多少档，有效值 5/10/20/50/100/500/1000，默认 100。
 */
export const FuturesOrderBookSchema = z.object({
  symbol: z.string().describe('交易对符号，如 BTCUSDT'),
  limit: z
    .number()
    .refine((v) => [5, 10, 20, 50, 100, 500, 1000].includes(v), 'depth limit must be one of 5/10/20/50/100/500/1000')
    .optional()
    .default(100)
    .describe('深度档位，默认100'),
});

/**
 * 期货聚合成交参数
 *
 * 支持分页和按时间范围查询。fromId 和 startTime/endTime 可选组合使用。
 */
export const FuturesAggTradesSchema = z.object({
  symbol: z.string().describe('交易对符号'),
  limit: z.number().min(1).max(1000).optional().default(500).describe('数量限制'),
  fromId: z.number().optional().describe('起始成交ID（用于分页）'),
  startTime: z.number().optional().describe('起始时间戳(ms)'),
  endTime: z.number().optional().describe('结束时间戳(ms)'),
});

/**
 * 期货最新成交参数
 */
export const FuturesTradesSchema = z.object({
  symbol: z.string().describe('交易对符号'),
  limit: z.number().min(1).max(1000).optional().default(500).describe('数量限制'),
});

/**
 * 期货 24 小时统计参数
 *
 * 不传 symbol 则返回全市场所有交易对统计。
 */
export const FuturesDailyStatsSchema = z.object({
  symbol: z.string().optional().describe('交易对符号，不传则获取所有'),
});

/**
 * 期货标记价格参数
 *
 * 标记价格用于计算未实现盈亏和强平。
 */
export const FuturesMarkPriceSchema = z.object({
  symbol: z.string().optional().describe('交易对符号，不传则获取所有'),
});

/**
 * 期货交易规则参数
 *
 * 支持按交易对过滤，避免全量返回 55k+ 行数据导致上下文溢出或触发限流。
 */
export const FuturesExchangeInfoSchema = z.object({
  symbol: z.string().optional().describe('交易对符号，如 BTCUSDT。不传则获取全部交易对信息（数据量极大，建议传 symbol）'),
});

/**
 * 期货全量价格参数
 *
 * 支持按交易对过滤单币种查询。
 */
export const FuturesPricesSchema = z.object({
  symbol: z.string().optional().describe('交易对符号，如 BTCUSDT。不传则获取全部 600+ 交易对价格'),
});

/**
 * 期货最优挂单参数
 *
 * 支持按交易对过滤。
 */
export const FuturesAllBookTickersSchema = z.object({
  symbol: z.string().optional().describe('交易对符号，如 BTCUSDT。不传则获取全部交易对最优挂单'),
});

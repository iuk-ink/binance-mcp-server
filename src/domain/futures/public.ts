/**
 * Binance MCP Server — 期货公开 REST 工具
 *
 * @module domain/futures/public
 * @description
 * 提供期货市场公开数据的 MCP 工具，共 11 个。
 * 公开工具不需要 API Key，始终注册。
 *
 * 每个工具的 handler 遵循统一模式：
 * 1. Zod Schema 自动校验输入（由 McpServer 在调用前完成）
 * 2. try/catch 包裹业务逻辑
 * 3. 错误通过 logError 记录到日志（自动脱敏）
 * 4. 返回标准 MCP 响应格式
 */

import { validateSymbol } from '../../utils/validation.js';
import { logError } from '../../utils/error-handling.js';
import { withRetry } from '../../utils/rate-limiter.js';
import { ok } from '../../utils/response.js';
import {
  FuturesSymbolSchema,
  FuturesKlinesSchema,
  FuturesOrderBookSchema,
  FuturesAggTradesSchema,
  FuturesTradesSchema,
  FuturesDailyStatsSchema,
  FuturesMarkPriceSchema,
  FuturesExchangeInfoSchema,
  FuturesPricesSchema,
  FuturesAllBookTickersSchema,
} from './schemas.js';
import type { ToolDefinition, BinanceClient } from '../../types/common.js';

/**
 * 创建期货公开工具列表
 *
 * @description
 * 将 Binance 客户端暴露的公开期货 REST 方法封装为 11 个 MCP 工具。
 * 这些工具不需要 API 认证，在 server.ts 中始终注册。
 *
 * 返回的数组元素为 ToolDefinition 类型，由 registerAll() 统一注册到 McpServer。
 *
 * @param client - Binance API 客户端实例（动态类型）
 * @returns 11 个公开期货 MCP 工具定义
 */
export function createFuturesPublicTools(client: unknown): ToolDefinition[] {
  const c = client as BinanceClient;

  return [
    // ---- 连通性 ----
    {
      name: 'futures_ping',
      description: '测试期货 API 连通性',
      schema: FuturesSymbolSchema,
      handler: async () => {
        try { const r = await c.futuresPing(); return ok({ ping: 'ok', data: r, timestamp: Date.now() }); }
        catch (e) { logError(e as Error, { tool: 'futures_ping' }); return ok({ error: true, message: (e as Error).message }); }
      },
    },

    // ---- 服务器时间 ----
    {
      name: 'futures_time',
      description: '获取期货服务器时间',
      schema: FuturesSymbolSchema,
      handler: async () => {
        try { const r = await c.futuresTime(); return ok({ serverTime: r, timestamp: Date.now() }); }
        catch (e) { logError(e as Error, { tool: 'futures_time' }); return ok({ error: true, message: (e as Error).message }); }
      },
    },

    // ---- 交易规则 ----
    {
      name: 'futures_exchange_info',
      description: '获取期货交易所交易规则和交易对信息（费率、最小下单量等）。⚠️ 不传 symbol 返回全量 55k+ 行数据将导致响应过大，强烈建议传 symbol',
      schema: FuturesExchangeInfoSchema,
      handler: async (args) => {
        const a = args as { symbol?: string };
        try {
          const r = await c.futuresExchangeInfo();
          // 传了 symbol 则过滤到单个交易对，避免 55k+ 行全量数据
          if (a.symbol) {
            validateSymbol(a.symbol);
            const symbols = (r as { symbols?: Array<{ symbol: string }> }).symbols || [];
            const info = symbols.find((s) => s.symbol === a.symbol);
            return ok({ symbol: a.symbol, info: info || null, timestamp: Date.now() });
          }
          return ok({ ...(r as object), timestamp: Date.now() });
        } catch (e) { logError(e as Error, { tool: 'futures_exchange_info' }); return ok({ error: true, message: (e as Error).message }); }
      },
    },

    // ---- 订单簿 ----
    {
      name: 'futures_orderbook',
      description: '获取期货订单簿深度数据',
      schema: FuturesOrderBookSchema,
      handler: async (args) => {
        const a = args as { symbol: string; limit: number };
        try {
          validateSymbol(a.symbol);
          const r = await c.futuresBook({ symbol: a.symbol, limit: a.limit }) as { bids: unknown; asks: unknown; lastUpdateId: number };
          return ok({ symbol: a.symbol, bids: r.bids, asks: r.asks, lastUpdateId: r.lastUpdateId, timestamp: Date.now() });
        } catch (e) { logError(e as Error, { tool: 'futures_orderbook' }); return ok({ error: true, message: (e as Error).message }); }
      },
    },

    // ---- K 线 ----
    {
      name: 'futures_klines',
      description: '获取期货K线数据',
      schema: FuturesKlinesSchema,
      handler: async (args) => {
        const a = args as { symbol: string; interval: string; limit: number };
        try {
          validateSymbol(a.symbol);
          // K 线接口是高权重请求，极易触发 IP 限流，使用指数退避重试
          const r = await withRetry(async () =>
            c.futuresCandles({ symbol: a.symbol, interval: a.interval, limit: a.limit }),
          );
          return ok({ symbol: a.symbol, interval: a.interval, data: r, timestamp: Date.now() });
        } catch (e) { logError(e as Error, { tool: 'futures_klines' }); return ok({ error: true, message: (e as Error).message }); }
      },
    },

    // ---- 聚合成交 ----
    {
      name: 'futures_agg_trades',
      description: '获取期货聚合成交数据（按时间聚合的成交记录）',
      schema: FuturesAggTradesSchema,
      handler: async (args) => {
        const a = args as { symbol: string; limit: number; fromId?: number; startTime?: number; endTime?: number };
        try {
          validateSymbol(a.symbol);
          const params: Record<string, unknown> = { symbol: a.symbol, limit: a.limit };
          if (a.fromId !== undefined) params.fromId = a.fromId;
          if (a.startTime !== undefined) params.startTime = a.startTime;
          if (a.endTime !== undefined) params.endTime = a.endTime;
          const r = await c.futuresAggTrades(params) as unknown[];
          return ok({ symbol: a.symbol, trades: r, count: r.length, timestamp: Date.now() });
        } catch (e) { logError(e as Error, { tool: 'futures_agg_trades' }); return ok({ error: true, message: (e as Error).message }); }
      },
    },

    // ---- 最新成交 ----
    {
      name: 'futures_trades',
      description: '获取期货最新逐笔成交记录',
      schema: FuturesTradesSchema,
      handler: async (args) => {
        const a = args as { symbol: string; limit: number };
        try {
          validateSymbol(a.symbol);
          const r = await c.futuresTrades({ symbol: a.symbol, limit: a.limit }) as unknown[];
          return ok({ symbol: a.symbol, trades: r, count: r.length, timestamp: Date.now() });
        } catch (e) { logError(e as Error, { tool: 'futures_trades' }); return ok({ error: true, message: (e as Error).message }); }
      },
    },

    // ---- 24 小时统计 ----
    {
      name: 'futures_daily_stats',
      description: '获取期货24小时价格变动统计（涨跌幅、成交量等）。⚠️ 不传 symbol 返回全市场数据（数据量极大），强烈建议传 symbol',
      schema: FuturesDailyStatsSchema,
      handler: async (args) => {
        const a = args as { symbol?: string };
        try {
          if (a.symbol) validateSymbol(a.symbol);
          const r = await c.futuresDailyStats(a.symbol ? { symbol: a.symbol } : undefined);
          const data = Array.isArray(r) ? r : [r];
          if (!a.symbol && data.length > 50) {
            return ok({ warning: `未指定 symbol，返回全量 ${data.length} 条，已截断至前 50 条。强烈建议传入 symbol 参数过滤`, data: data.slice(0, 50), total: data.length, timestamp: Date.now() });
          }
          return ok({ data, timestamp: Date.now() });
        } catch (e) { logError(e as Error, { tool: 'futures_daily_stats' }); return ok({ error: true, message: (e as Error).message }); }
      },
    },

    // ---- 当前价格 ----
    {
      name: 'futures_prices',
      description: '获取期货当前交易对价格。⚠️ 不传 symbol 会返回全部 600+ 交易对价格（数据量极大），强烈建议传 symbol',
      schema: FuturesPricesSchema,
      handler: async (args) => {
        const a = args as { symbol?: string };
        try {
          const r = await c.futuresPrices(a.symbol ? { symbol: a.symbol } : undefined) as Record<string, string>;
          if (a.symbol) {
            return ok({ symbol: a.symbol, price: r[a.symbol] || null, timestamp: Date.now() });
          }
          const entries = Object.entries(r);
          if (entries.length > 50) {
            return ok({ warning: `未指定 symbol，返回全量 ${entries.length} 个交易对，已截断至前 50 个。强烈建议传入 symbol 过滤`, prices: Object.fromEntries(entries.slice(0, 50)), total: entries.length, timestamp: Date.now() });
          }
          return ok({ prices: r, timestamp: Date.now() });
        } catch (e) { logError(e as Error, { tool: 'futures_prices' }); return ok({ error: true, message: (e as Error).message }); }
      },
    },

    // ---- 最优挂单 ----
    {
      name: 'futures_all_book_tickers',
      description: '获取期货交易对的最优买卖挂单/买一卖一。⚠️ 不传 symbol 返回全部交易对（数据量极大），强烈建议传 symbol',
      schema: FuturesAllBookTickersSchema,
      handler: async (args) => {
        const a = args as { symbol?: string };
        try {
          const r = await c.futuresAllBookTickers() as Record<string, { symbol: string }>;
          if (a.symbol) {
            validateSymbol(a.symbol);
            const ticker = r[a.symbol] || null;
            return ok({ symbol: a.symbol, ticker, timestamp: Date.now() });
          }
          const entries = Object.entries(r);
          if (entries.length > 50) {
            return ok({ warning: `未指定 symbol，返回全量 ${entries.length} 个交易对，已截断至前 50 个。强烈建议传入 symbol 过滤`, tickers: Object.fromEntries(entries.slice(0, 50)), total: entries.length, timestamp: Date.now() });
          }
          return ok({ tickers: r, timestamp: Date.now() });
        } catch (e) { logError(e as Error, { tool: 'futures_all_book_tickers' }); return ok({ error: true, message: (e as Error).message }); }
      },
    },

    // ---- 标记价格 ----
    {
      name: 'futures_mark_price',
      description: '获取期货标记价格（用于计算未实现盈亏和强平判断）。⚠️ 不传 symbol 返回全部交易对（数据量极大），强烈建议传 symbol',
      schema: FuturesMarkPriceSchema,
      handler: async (args) => {
        const a = args as { symbol?: string };
        try {
          const r = await c.futuresMarkPrice(a.symbol ? { symbol: a.symbol } : undefined);
          const data = Array.isArray(r) ? r : [r];
          if (!a.symbol && data.length > 50) {
            return ok({ warning: `未指定 symbol，返回全量 ${data.length} 条，已截断至前 50 条。强烈建议传入 symbol 参数过滤`, data: data.slice(0, 50), total: data.length, timestamp: Date.now() });
          }
          return ok({ data, timestamp: Date.now() });
        } catch (e) { logError(e as Error, { tool: 'futures_mark_price' }); return ok({ error: true, message: (e as Error).message }); }
      },
    },

  ];
}

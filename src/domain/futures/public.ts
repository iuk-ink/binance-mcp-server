/**
 * Binance MCP Server v2.0 — 期货公开 REST 工具
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

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { validateSymbol } from '../../utils/validation.js';
import { logError } from '../../utils/error-handling.js';
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
import type { ToolDefinition } from '../../types/common.js';

function ok(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

export function createFuturesPublicTools(client: unknown): ToolDefinition[] {
  const c = client as Record<string, (...args: unknown[]) => unknown>;

  return [
    // ---- 连通性 ----
    {
      name: 'futures_ping',
      description: '测试期货 API 连通性',
      schema: FuturesSymbolSchema,
      handler: async () => {
        try { const r = await c.futuresPing(); return ok({ ping: 'ok', data: r, timestamp: Date.now() }); }
        catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); }
      },
    },

    // ---- 服务器时间 ----
    {
      name: 'futures_time',
      description: '获取期货服务器时间',
      schema: FuturesSymbolSchema,
      handler: async () => {
        try { const r = await c.futuresTime(); return ok({ serverTime: r, timestamp: Date.now() }); }
        catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); }
      },
    },

    // ---- 交易规则 ----
    {
      name: 'futures_exchange_info',
      description: '获取期货交易所交易规则和交易对信息（费率、最小下单量等）',
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
          return ok(r);
        } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); }
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
        } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); }
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
          const r = await c.futuresCandles({ symbol: a.symbol, interval: a.interval, limit: a.limit });
          return ok({ symbol: a.symbol, interval: a.interval, data: r, timestamp: Date.now() });
        } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); }
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
        } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); }
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
        } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); }
      },
    },

    // ---- 24 小时统计 ----
    {
      name: 'futures_daily_stats',
      description: '获取期货24小时价格变动统计（涨跌幅、成交量等）',
      schema: FuturesDailyStatsSchema,
      handler: async (args) => {
        const a = args as { symbol?: string };
        try {
          if (a.symbol) validateSymbol(a.symbol);
          const r = await c.futuresDailyStats(a.symbol ? { symbol: a.symbol } : undefined);
          return ok({ data: Array.isArray(r) ? r : [r], timestamp: Date.now() });
        } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); }
      },
    },

    // ---- 当前价格 ----
    {
      name: 'futures_prices',
      description: '获取期货当前交易对价格（支持按 symbol 过滤单个交易对）',
      schema: FuturesPricesSchema,
      handler: async (args) => {
        const a = args as { symbol?: string };
        try {
          const r = await c.futuresPrices() as Array<{ symbol: string }>;
          if (a.symbol) {
            validateSymbol(a.symbol);
            const match = r.find((p) => p.symbol === a.symbol);
            return ok({ symbol: a.symbol, price: match || null, timestamp: Date.now() });
          }
          return ok({ prices: r, timestamp: Date.now() });
        } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); }
      },
    },

    // ---- 最优挂单 ----
    {
      name: 'futures_all_book_tickers',
      description: '获取期货交易对的最优买卖挂单/买一卖一（支持按 symbol 过滤）',
      schema: FuturesAllBookTickersSchema,
      handler: async (args) => {
        const a = args as { symbol?: string };
        try {
          const r = await c.futuresAllBookTickers() as Array<{ symbol: string }>;
          if (a.symbol) {
            validateSymbol(a.symbol);
            const match = r.find((t) => t.symbol === a.symbol);
            return ok({ symbol: a.symbol, ticker: match || null, timestamp: Date.now() });
          }
          return ok({ tickers: r, timestamp: Date.now() });
        } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); }
      },
    },

    // ---- 标记价格 ----
    {
      name: 'futures_mark_price',
      description: '获取期货标记价格（用于计算未实现盈亏和强平判断）',
      schema: FuturesMarkPriceSchema,
      handler: async (args) => {
        const a = args as { symbol?: string };
        try {
          const r = await c.futuresMarkPrice(a.symbol ? { symbol: a.symbol } : undefined);
          return ok({ data: Array.isArray(r) ? r : [r], timestamp: Date.now() });
        } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); }
      },
    },

  ];
}

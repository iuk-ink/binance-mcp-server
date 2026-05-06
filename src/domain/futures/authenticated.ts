/**
 * Binance MCP Server v2.0 — 期货认证 REST 工具
 *
 * @module domain/futures/authenticated
 * @description
 * 提供需要 API Key 认证的期货交易和账户管理 MCP 工具，共 17 个。
 * 这些工具仅在检测到 BINANCE_API_KEY + BINANCE_API_SECRET 时注册。
 *
 * 工具分类：
 * - 账户查询 (3): account_balance, income, user_trades
 * - 杠杆与保证金 (4): leverage, margin_type, position_margin, margin_history
 * - 杠杆分层 (1): leverage_bracket
 * - 下单与改单 (6): order, update_order, get_order, all_orders, batch_orders, cancel_batch_orders
 * - 取消与活跃订单 (3): cancel_order, cancel_all_open_orders, open_orders
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { validateSymbol, validateQuantity, validatePrice } from '../../utils/validation.js';
import { logError } from '../../utils/error-handling.js';
import {
  FuturesSymbolSchema,
  FuturesLeverageSchema,
  FuturesMarginTypeSchema,
  FuturesPositionMarginSchema,
  FuturesMarginHistorySchema,
  FuturesIncomeSchema,
  FuturesUserTradesSchema,
  FuturesLeverageBracketSchema,
  FuturesOrderSchema,
  FuturesUpdateOrderSchema,
  FuturesGetOrderSchema,
  FuturesAllOrdersSchema,
  FuturesBatchOrdersSchema,
  FuturesCancelBatchOrdersSchema,
  FuturesCancelOrderSchema,
  FuturesCancelAllOpenOrdersSchema,
  FuturesOpenOrdersSchema,
} from './schemas.js';
import type { ToolDefinition } from '../../types/common.js';

function ok(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

export function createFuturesAuthenticatedTools(client: unknown): ToolDefinition[] {
  const c = client as Record<string, (...args: unknown[]) => unknown>;

  return [
    // ==================== 账户查询 ====================

    /** 期货账户余额 — 获取所有资产的余额和可用余额 */
    {
      name: 'futures_account_balance',
      description: '获取期货账户余额',
      schema: FuturesSymbolSchema,
      handler: async () => {
        try { const r = await c.futuresAccountBalance(); return ok({ balances: r, timestamp: Date.now() }); }
        catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); }
      },
    },

    /** 收益历史 — 资金费率、已实现盈亏、佣金等流水 */
    {
      name: 'futures_income',
      description: '获取期货收益历史（资金费率/已实现盈亏/佣金等）',
      schema: FuturesIncomeSchema,
      handler: async (args) => {
        const a = args as Record<string, unknown>;
        try {
          const params: Record<string, unknown> = {};
          if (a.symbol) { validateSymbol(a.symbol as string); params.symbol = a.symbol; }
          if (a.incomeType !== undefined) params.incomeType = a.incomeType;
          if (a.startTime !== undefined) params.startTime = a.startTime;
          if (a.endTime !== undefined) params.endTime = a.endTime;
          if (a.limit !== undefined) params.limit = a.limit;
          const r = await c.futuresIncome(params) as unknown[];
          return ok({ data: r, count: r.length, timestamp: Date.now() });
        } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); }
      },
    },

    /** 账户成交历史 */
    {
      name: 'futures_user_trades',
      description: '获取期货账户成交历史',
      schema: FuturesUserTradesSchema,
      handler: async (args) => {
        const a = args as Record<string, unknown>;
        try {
          validateSymbol(a.symbol as string);
          const params: Record<string, unknown> = { symbol: a.symbol };
          if (a.startTime !== undefined) params.startTime = a.startTime;
          if (a.endTime !== undefined) params.endTime = a.endTime;
          if (a.limit !== undefined) params.limit = a.limit;
          if (a.fromId !== undefined) params.fromId = a.fromId;
          const r = await c.futuresUserTrades(params) as unknown[];
          return ok({ symbol: a.symbol, trades: r, count: r.length, timestamp: Date.now() });
        } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); }
      },
    },

    // ==================== 杠杆与保证金 ====================

    /** 调整杠杆 — 目标倍数 1-125 */
    {
      name: 'futures_leverage',
      description: '调整期货杠杆倍数（1-125）',
      schema: FuturesLeverageSchema,
      handler: async (args) => {
        const a = args as { symbol: string; leverage: number };
        try {
          validateSymbol(a.symbol);
          const r = await c.futuresLeverage({ symbol: a.symbol, leverage: a.leverage });
          return ok({ ...(r as object), timestamp: Date.now() });
        } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); }
      },
    },

    /** 保证金模式 — 逐仓 vs 全仓 */
    {
      name: 'futures_margin_type',
      description: '调整期货保证金模式（逐仓 ISOLATED / 全仓 CROSSED）',
      schema: FuturesMarginTypeSchema,
      handler: async (args) => {
        const a = args as { symbol: string; marginType: string };
        try {
          validateSymbol(a.symbol);
          const r = await c.futuresMarginType({ symbol: a.symbol, marginType: a.marginType });
          return ok({ ...(r as object), timestamp: Date.now() });
        } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); }
      },
    },

    /** 逐仓保证金调整 */
    {
      name: 'futures_position_margin',
      description: '调整逐仓保证金（追加/减少）',
      schema: FuturesPositionMarginSchema,
      handler: async (args) => {
        const a = args as { symbol: string; amount: string; type: number; positionSide?: string };
        try {
          validateSymbol(a.symbol);
          const params: Record<string, unknown> = { symbol: a.symbol, amount: a.amount, type: a.type };
          if (a.positionSide) params.positionSide = a.positionSide;
          const r = await c.futuresPositionMargin(params);
          return ok({ ...(r as object), timestamp: Date.now() });
        } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); }
      },
    },

    /** 保证金变更历史 */
    {
      name: 'futures_margin_history',
      description: '获取期货保证金变更历史',
      schema: FuturesMarginHistorySchema,
      handler: async (args) => {
        const a = args as Record<string, unknown>;
        try {
          validateSymbol(a.symbol as string);
          const params: Record<string, unknown> = { symbol: a.symbol };
          if (a.type !== undefined) params.type = a.type;
          if (a.startTime !== undefined) params.startTime = a.startTime;
          if (a.endTime !== undefined) params.endTime = a.endTime;
          if (a.limit !== undefined) params.limit = a.limit;
          const r = await c.futuresMarginHistory(params) as unknown[];
          return ok({ data: r, count: r.length, timestamp: Date.now() });
        } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); }
      },
    },

    // ==================== 杠杆分层 ====================

    /** 杠杆分层 — 不同名义仓位对应的最大杠杆 */
    {
      name: 'futures_leverage_bracket',
      description: '获取期货杠杆分层信息（不同仓位对应的最大杠杆）',
      schema: FuturesLeverageBracketSchema,
      handler: async (args) => {
        const a = args as { symbol?: string };
        try {
          const r = await c.futuresLeverageBracket(a.symbol ? { symbol: a.symbol } : undefined);
          return ok({ brackets: r, timestamp: Date.now() });
        } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); }
      },
    },

    // ==================== 下单与改单（Phase 2C-4） ====================

    /** 期货下单 — 支持限价/市价/止损/止盈/跟踪止损 */
    {
      name: 'futures_order',
      description: '期货下单（限价/市价/止损/止盈/跟踪止损等）',
      schema: FuturesOrderSchema,
      handler: async (args) => {
        const a = args as Record<string, unknown>;
        try {
          validateSymbol(a.symbol as string);
          validateQuantity(a.quantity as string);
          if (a.price) validatePrice(a.price as string);
          const params: Record<string, unknown> = { symbol: a.symbol, side: a.side, type: a.type, quantity: a.quantity };
          if (a.positionSide !== undefined) params.positionSide = a.positionSide;
          if (a.price !== undefined) params.price = a.price;
          if (a.type === 'LIMIT') params.timeInForce = (a.timeInForce as string) || 'GTC';
          if (a.reduceOnly !== undefined) params.reduceOnly = a.reduceOnly;
          if (a.stopPrice !== undefined) params.stopPrice = a.stopPrice;
          if (a.activationPrice !== undefined) params.activationPrice = a.activationPrice;
          if (a.callbackRate !== undefined) params.callbackRate = a.callbackRate;
          if (a.workingType !== undefined) params.workingType = a.workingType;
          if (a.closePosition !== undefined) params.closePosition = a.closePosition;
          const r = await c.futuresOrder(params);
          return ok({ ...(r as object), timestamp: Date.now() });
        } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); }
      },
    },

    /** 修改订单 */
    {
      name: 'futures_update_order',
      description: '修改期货订单（修改价格/数量等）',
      schema: FuturesUpdateOrderSchema,
      handler: async (args) => {
        const a = args as Record<string, unknown>;
        try {
          validateSymbol(a.symbol as string);
          const params: Record<string, unknown> = { orderId: a.orderId, symbol: a.symbol, side: a.side, type: a.type, quantity: a.quantity };
          if (a.positionSide !== undefined) params.positionSide = a.positionSide;
          if (a.price !== undefined) params.price = a.price;
          const r = await c.futuresUpdateOrder(params);
          return ok({ ...(r as object), timestamp: Date.now() });
        } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); }
      },
    },

    /** 查询单个订单 */
    {
      name: 'futures_get_order',
      description: '查询期货订单状态（按订单ID或客户端ID）',
      schema: FuturesGetOrderSchema,
      handler: async (args) => {
        const a = args as Record<string, unknown>;
        try {
          validateSymbol(a.symbol as string);
          const r = await c.futuresGetOrder(a);
          return ok({ ...(r as object), timestamp: Date.now() });
        } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); }
      },
    },

    /** 全量订单查询 */
    {
      name: 'futures_all_orders',
      description: '获取期货所有订单（含历史，支持分页和时间筛选）',
      schema: FuturesAllOrdersSchema,
      handler: async (args) => {
        const a = args as Record<string, unknown>;
        try {
          validateSymbol(a.symbol as string);
          const params: Record<string, unknown> = { symbol: a.symbol };
          if (a.orderId !== undefined) params.orderId = a.orderId;
          if (a.startTime !== undefined) params.startTime = a.startTime;
          if (a.endTime !== undefined) params.endTime = a.endTime;
          if (a.limit !== undefined) params.limit = a.limit;
          const r = await c.futuresAllOrders(params) as unknown[];
          return ok({ symbol: a.symbol, orders: r, count: r.length, timestamp: Date.now() });
        } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); }
      },
    },

    /** 批量下单 */
    {
      name: 'futures_batch_orders',
      description: '期货批量下单（最多5单）',
      schema: FuturesBatchOrdersSchema,
      handler: async (args) => {
        const a = args as { batchOrders: unknown[] };
        try {
          // binance-api-node 底层用 encodeURIComponent 序列化参数，
          // JavaScript 数组直接编码会变成 "[object Object]"，必须 JSON 序列化
          const r = await c.futuresBatchOrders({ batchOrders: JSON.stringify(a.batchOrders) });
          return ok({ orders: r, count: (r as unknown[]).length, timestamp: Date.now() });
        } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); }
      },
    },

    /** 批量取消 */
    {
      name: 'futures_cancel_batch_orders',
      description: '期货批量取消订单',
      schema: FuturesCancelBatchOrdersSchema,
      handler: async (args) => {
        const a = args as Record<string, unknown>;
        try {
          validateSymbol(a.symbol as string);
          const params: Record<string, unknown> = { symbol: a.symbol };
          if (a.orderIdList) params.orderIdList = a.orderIdList;
          if (a.origClientOrderIdList) params.origClientOrderIdList = a.origClientOrderIdList;
          const r = await c.futuresCancelBatchOrders(params);
          return ok({ cancelled: r, timestamp: Date.now() });
        } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); }
      },
    },

    // ==================== 单笔取消 + 活跃订单 ====================

    /** 单笔取消 — 普通单用 orderId，条件单用 algoId */
    {
      name: 'futures_cancel_order',
      description: '取消单笔期货订单（普通单传 orderId，条件单传 algoId）',
      schema: FuturesCancelOrderSchema,
      handler: async (args) => {
        const a = args as Record<string, unknown>;
        try {
          validateSymbol(a.symbol as string);
          // 构建参数：普通单用 orderId/origClientOrderId，条件单用 algoId/clientAlgoId
          const params: Record<string, unknown> = { symbol: a.symbol };
          if (a.orderId) params.orderId = a.orderId;
          if (a.origClientOrderId) params.origClientOrderId = a.origClientOrderId;
          if (a.algoId) { params.algoId = a.algoId; params.conditional = true; }
          if (a.clientAlgoId) { params.clientAlgoId = a.clientAlgoId; params.conditional = true; }
          const r = await c.futuresCancelOrder(params);
          return ok({ cancelled: r, timestamp: Date.now() });
        } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); }
      },
    },

    /** 取消某交易对所有活跃订单（含条件单） */
    {
      name: 'futures_cancel_all_open_orders',
      description: '取消指定交易对所有活跃订单（一键清仓）',
      schema: FuturesCancelAllOpenOrdersSchema,
      handler: async (args) => {
        const a = args as { symbol: string };
        try {
          validateSymbol(a.symbol);
          const r = await c.futuresCancelAllOpenOrders({ symbol: a.symbol }) as unknown[];
          return ok({ symbol: a.symbol, cancelled: r, count: r.length, timestamp: Date.now() });
        } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); }
      },
    },

    /** 查询活跃订单（含条件单） */
    {
      name: 'futures_open_orders',
      description: '查询期货当前活跃订单（含止损/止盈/追踪等条件单）',
      schema: FuturesOpenOrdersSchema,
      handler: async (args) => {
        const a = args as { symbol?: string };
        try {
          const r = await c.futuresOpenOrders(a.symbol ? { symbol: a.symbol } : undefined) as unknown[];
          return ok({ orders: r, count: r.length, timestamp: Date.now() });
        } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); }
      },
    },
  ];
}

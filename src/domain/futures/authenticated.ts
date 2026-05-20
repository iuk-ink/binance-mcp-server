/**
 * Binance MCP Server — 期货认证 REST 工具
 *
 * @module domain/futures/authenticated
 * @description
 * 提供需要 API Key 认证的期货交易和账户管理 MCP 工具，共 19 个。
 * 这些工具仅在检测到 BINANCE_API_KEY + BINANCE_API_SECRET 时注册。
 *
 * 工具分类：
 * - 账户查询 (3): account_balance, income, user_trades
 * - 杠杆与保证金 (4): leverage, margin_type, position_margin, margin_history
 * - 杠杆分层 (1): leverage_bracket
 * - 下单与改单 (6): order, update_order, get_order, all_orders, batch_orders, cancel_batch_orders
 * - 取消与活跃订单 (3): cancel_order, cancel_all_open_orders, open_orders
 * - 辅助工具 (2): account_report, quick_order
 */

import { validateSymbol, validateQuantity, validatePrice } from '../../utils/validation.js';
import { logError } from '../../utils/error-handling.js';
import { withRetry } from '../../utils/rate-limiter.js';
import { ok } from '../../utils/response.js';
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
  FuturesAccountReportSchema,
  FuturesQuickOrderSchema,
} from './schemas.js';
import type { ToolDefinition, BinanceClient } from '../../types/common.js';

/**
 * 创建期货认证工具列表
 *
 * @description
 * 将 Binance 客户端的认证期货 REST 方法封装为 19 个 MCP 工具。
 * 仅在配置了 BINANCE_API_KEY + BINANCE_API_SECRET 时被调用和注册。
 *
 * 工具覆盖：账户查询(3) + 杠杆与保证金(4) + 杠杆分层(1) + 下单改单(6) + 取消活跃(3) + 辅助(2)
 *
 * @param client - Binance API 客户端实例（动态类型）
 * @returns 19 个认证期货 MCP 工具定义
 */
export function createFuturesAuthenticatedTools(client: unknown): ToolDefinition[] {
  const c = client as BinanceClient;

  return [
    // ==================== 账户查询 ====================

    /** 期货账户余额 — 获取所有资产的余额和可用余额 */
    {
      name: 'futures_account_balance',
      description: '获取期货账户余额',
      schema: FuturesSymbolSchema,
      handler: async () => {
        try { const r = await c.futuresAccountBalance(); return ok({ balances: r, timestamp: Date.now() }); }
        catch (e) { logError(e as Error, { tool: 'futures_account_balance' }); return ok({ error: true, message: (e as Error).message }); }
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
        } catch (e) { logError(e as Error, { tool: 'futures_income' }); return ok({ error: true, message: (e as Error).message }); }
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
        } catch (e) { logError(e as Error, { tool: 'futures_user_trades' }); return ok({ error: true, message: (e as Error).message }); }
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
        } catch (e) { logError(e as Error, { tool: 'futures_leverage' }); return ok({ error: true, message: (e as Error).message }); }
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
        } catch (e) { logError(e as Error, { tool: 'futures_margin_type' }); return ok({ error: true, message: (e as Error).message }); }
      },
    },

    /** 逐仓保证金调整 */
    {
      name: 'futures_position_margin',
      description: '调整逐仓保证金（追加/减少），操作后自动返回最新账户余额',
      schema: FuturesPositionMarginSchema,
      handler: async (args) => {
        const a = args as { symbol: string; amount: string; type: number; positionSide?: string };
        try {
          validateSymbol(a.symbol);
          const params: Record<string, unknown> = { symbol: a.symbol, amount: a.amount, type: a.type };
          if (a.positionSide) params.positionSide = a.positionSide;
          const r = await c.futuresPositionMargin(params);
          // 操作后查询最新账户余额，供用户确认资金变动
          const balances = await c.futuresAccountBalance() as unknown;
          return ok({ ...(r as object), balances, timestamp: Date.now() });
        } catch (e) { logError(e as Error, { tool: 'futures_position_margin' }); return ok({ error: true, message: (e as Error).message }); }
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
        } catch (e) { logError(e as Error, { tool: 'futures_margin_history' }); return ok({ error: true, message: (e as Error).message }); }
      },
    },

    // ==================== 杠杆分层 ====================

    /** 杠杆分层 — 不同名义仓位对应的最大杠杆 */
    {
      name: 'futures_leverage_bracket',
      description: '获取期货杠杆分层信息（不同仓位对应的最大杠杆）。⚠️ 不传 symbol 返回全部交易对（数据量极大），强烈建议传 symbol',
      schema: FuturesLeverageBracketSchema,
      handler: async (args) => {
        const a = args as { symbol?: string };
        try {
          const r = await c.futuresLeverageBracket(a.symbol ? { symbol: a.symbol } : undefined);
          const data = Array.isArray(r) ? r : [r];
          if (!a.symbol && data.length > 50) {
            return ok({ warning: `未指定 symbol，返回全量 ${data.length} 条，已截断至前 50 条。强烈建议传入 symbol 参数过滤`, brackets: data.slice(0, 50), total: data.length, timestamp: Date.now() });
          }
          return ok({ brackets: r, timestamp: Date.now() });
        } catch (e) { logError(e as Error, { tool: 'futures_leverage_bracket' }); return ok({ error: true, message: (e as Error).message }); }
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
          const r = await withRetry(async () => c.futuresOrder(params));
          return ok({ ...(r as object), timestamp: Date.now() });
        } catch (e) { logError(e as Error, { tool: 'futures_order' }); return ok({ error: true, message: (e as Error).message }); }
      },
    },

    /** 修改订单 — 仅 orderId + symbol 必填，其余按需传 */
    {
      name: 'futures_update_order',
      description: '修改期货订单（修改价格/数量等。建议传 side+type 避免 Binance 校验不通过，仅 orderId+symbol 必填）',
      schema: FuturesUpdateOrderSchema,
      handler: async (args) => {
        const a = args as Record<string, unknown>;
        try {
          validateSymbol(a.symbol as string);
          const params: Record<string, unknown> = { orderId: a.orderId, symbol: a.symbol };
          if (a.positionSide !== undefined) params.positionSide = a.positionSide;
          if (a.side !== undefined) params.side = a.side;
          if (a.type !== undefined) params.type = a.type;
          if (a.quantity !== undefined) params.quantity = a.quantity;
          if (a.price !== undefined) params.price = a.price;
          const r = await c.futuresUpdateOrder(params);
          return ok({ ...(r as object), timestamp: Date.now() });
        } catch (e) { logError(e as Error, { tool: 'futures_update_order' }); return ok({ error: true, message: (e as Error).message }); }
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
        } catch (e) { logError(e as Error, { tool: 'futures_get_order' }); return ok({ error: true, message: (e as Error).message }); }
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
        } catch (e) { logError(e as Error, { tool: 'futures_all_orders' }); return ok({ error: true, message: (e as Error).message }); }
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
          // 防御性校验：确保 batchOrders 是非空数组
          if (!Array.isArray(a.batchOrders) || a.batchOrders.length === 0) {
            return ok({ error: true, message: 'batchOrders 必须为非空数组' });
          }
          // binance-api-node 底层用 encodeURIComponent 序列化参数，
          // JavaScript 数组直接编码会变成 "[object Object]"，必须 JSON 序列化
          const r = await withRetry(async () => c.futuresBatchOrders({ batchOrders: JSON.stringify(a.batchOrders) }));
          return ok({ orders: r, count: (r as unknown[]).length, timestamp: Date.now() });
        } catch (e) { logError(e as Error, { tool: 'futures_batch_orders' }); return ok({ error: true, message: (e as Error).message }); }
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
          // binance-api-node 需要 JSON 字符串，handler 内自动序列化数组参数
          if (a.orderIdList) params.orderIdList = JSON.stringify(a.orderIdList);
          if (a.origClientOrderIdList) params.origClientOrderIdList = JSON.stringify(a.origClientOrderIdList);
          const r = await withRetry(async () => c.futuresCancelBatchOrders(params));
          return ok({ cancelled: r, timestamp: Date.now() });
        } catch (e) { logError(e as Error, { tool: 'futures_cancel_batch_orders' }); return ok({ error: true, message: (e as Error).message }); }
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
        } catch (e) { logError(e as Error, { tool: 'futures_cancel_order' }); return ok({ error: true, message: (e as Error).message }); }
      },
    },

    /** 取消某交易对所有活跃订单（含条件单）— 危险操作需传 confirm="CONFIRM" */
    {
      name: 'futures_cancel_all_open_orders',
      description: '取消指定交易对所有活跃订单（含条件单）。此操作不可撤销，必须传 confirm="CONFIRM" 确认',
      schema: FuturesCancelAllOpenOrdersSchema,
      handler: async (args) => {
        const a = args as { symbol: string; confirm: string };
        try {
          validateSymbol(a.symbol);
          if (a.confirm !== 'CONFIRM') {
            return ok({ error: true, message: '危险操作：必须传入 confirm="CONFIRM" 以确认执行一键清仓' });
          }
          // 取消前先查询活跃订单和条件单，返回被取消的订单 ID 供用户确认
          const algoFn = (c as BinanceClient).futuresGetOpenAlgoOrders;
          const [beforeOpen, algoOrders] = await Promise.all([
            c.futuresOpenOrders({ symbol: a.symbol }) as Promise<Array<{ orderId: number }>>,
            algoFn ? (algoFn({ symbol: a.symbol }) as Promise<Array<{ algoId: number }>>).catch(() => []) : Promise.resolve([]),
          ]);
          const regularIds = beforeOpen.map((o) => o.orderId);
          const algoIds = (algoOrders || []).map((o: { algoId: number }) => o.algoId);
          // 并行取消普通订单和条件单
          const cancelAlgoFn = (c as BinanceClient).futuresCancelAllAlgoOpenOrders as ((payload: { symbol: string }) => Promise<unknown>) | undefined;
          await Promise.all([
            c.futuresCancelAllOpenOrders({ symbol: a.symbol }),
            cancelAlgoFn ? cancelAlgoFn({ symbol: a.symbol }).catch(() => null) : Promise.resolve(null),
          ]);
          return ok({ symbol: a.symbol, cancelledRegularCount: regularIds.length, cancelledRegularIds: regularIds, cancelledAlgoCount: algoIds.length, cancelledAlgoIds: algoIds, timestamp: Date.now() });
        } catch (e) { logError(e as Error, { tool: 'futures_cancel_all_open_orders' }); return ok({ error: true, message: (e as Error).message }); }
      },
    },

    /** 查询活跃订单（含条件单并行查询）
     *
     * 技术细节：
     * - Binance 将普通订单和条件单（STOP/TAKE_PROFIT/TRAILING）分为两个独立端点
     * - 此处并行查询两者并合并返回，避免调用方分别调用
     * - algoOrders 结果同时包含止损/止盈/追踪止损等条件单
     */
    {
      name: 'futures_open_orders',
      description: '查询期货当前活跃订单（含止损/止盈/追踪等条件单）',
      schema: FuturesOpenOrdersSchema,
      handler: async (args) => {
        const a = args as { symbol?: string };
        try {
          const params = a.symbol ? { symbol: a.symbol } : undefined;
          // 并行查询普通单和条件单（Binance REST 分两个端点）
          const ordersPromise = withRetry(async () => c.futuresOpenOrders(params) as Promise<unknown[]>);
          const algoFn = (c as BinanceClient).futuresGetOpenAlgoOrders;
          const algoPromise: Promise<unknown[]> = algoFn
            ? (algoFn(params) as Promise<unknown[]>).catch(() => [])
            : Promise.resolve([]);
          const [orders, algoOrders] = await Promise.all([ordersPromise, algoPromise]);
          const total = (orders?.length ?? 0) + (algoOrders?.length ?? 0);
          return ok({ orders, algoOrders, count: total, timestamp: Date.now() });
        } catch (e) { logError(e as Error, { tool: 'futures_open_orders' }); return ok({ error: true, message: (e as Error).message }); }
      },
    },

    // ==================== 辅助工具 ====================

    /** 账户全景报告 — 默认紧凑模式：只返回持仓+活跃订单（去重省 token），compact=false 可恢复全量
     *
     * 设计说明：
     * - compact=true（默认）：仅调 positions + openOrders，跳过 balances/accountInfo
     *   （balances 含在 positions 的 margin 字段内，accountInfo 与 positions 重复）
     * - 零持仓过滤：默认 hideZeroPositions=true，过滤 positionAmt===0 的历史残留
     * - filteredOut 字段指示被过滤的零持仓数量
     */
    {
      name: 'futures_account_report',
      description: '获取期货账户全景报告。默认紧凑模式（compact=true）：只返回持仓+活跃订单，省 token。传 compact=false 可恢复全量（含 balances+accountInfo）',
      schema: FuturesAccountReportSchema,
      handler: async (args) => {
        const a = args as { hideZeroPositions?: boolean; compact?: boolean };
        try {
          const hideZero = a.hideZeroPositions !== false;
          const isCompact = a.compact !== false;
          // compact 模式：只调 positions + openOrders（余额含在 positions 内，accountInfo 冗余）
          const [positions, openOrders] = await Promise.all([
            withRetry(async () => (c as BinanceClient).futuresPositionRisk?.() as Promise<unknown> ?? Promise.resolve(null)),
            withRetry(async () => c.futuresOpenOrders() as Promise<unknown>),
          ]);
          const filteredPositions = hideZero && Array.isArray(positions)
            ? (positions as Array<{ positionAmt: string }>)
                .filter(p => parseFloat(p.positionAmt) !== 0)
            : positions;
          const totalPositions = Array.isArray(positions) ? positions.length : 0;
          const result: Record<string, unknown> = { positions: filteredPositions, openOrders, timestamp: Date.now() };
          if (hideZero && totalPositions > (Array.isArray(filteredPositions) ? filteredPositions.length : 0)) {
            result.totalPositions = totalPositions;
            result.filteredOut = totalPositions - (Array.isArray(filteredPositions) ? filteredPositions.length : 0);
          }
          if (!isCompact) {
            const [balances, accountInfo] = await Promise.all([
              withRetry(async () => c.futuresAccountBalance() as Promise<unknown>),
              withRetry(async () => (c as BinanceClient).futuresAccountInfo?.() as Promise<unknown> ?? Promise.resolve(null)),
            ]);
            const filteredAccountInfo = hideZero && accountInfo && typeof accountInfo === 'object'
              ? {
                  ...(accountInfo as Record<string, unknown>),
                  positions: Array.isArray((accountInfo as Record<string, unknown>).positions)
                    ? ((accountInfo as Record<string, unknown>).positions as Array<{ positionAmt: string }>)
                        .filter(p => parseFloat(p.positionAmt) !== 0)
                    : (accountInfo as Record<string, unknown>).positions,
                }
              : accountInfo;
            result.balances = balances;
            result.accountInfo = filteredAccountInfo;
          }
          return ok(result);
        } catch (e) { logError(e as Error, { tool: 'futures_account_report' }); return ok({ error: true, message: (e as Error).message }); }
      },
    },

    /** 一键止损/止盈 — 根据百分比偏移自动计算触发价并下条件单 */
    {
      name: 'futures_quick_order',
      description: '一键设置止损或止盈单。传入当前价格和偏移百分比，自动计算触发价并下条件单',
      schema: FuturesQuickOrderSchema,
      handler: async (args) => {
        const a = args as Record<string, unknown>;
        try {
          validateSymbol(a.symbol as string);
          const cp = parseFloat(a.currentPrice as string);
          const pct = parseFloat(a.offsetPercent as string);
          const isLong = a.positionSide === 'LONG' || a.side === 'SELL';
          const isStopLoss = a.orderType === 'STOP_LOSS';
          // STOP_LOSS: 做多低于现价, 做空高于现价 | TAKE_PROFIT: 做多高于现价, 做空低于现价
          const triggerPrice = (() => {
            if (isStopLoss) return (isLong ? cp * (1 - pct / 100) : cp * (1 + pct / 100)).toFixed(2);
            return (isLong ? cp * (1 + pct / 100) : cp * (1 - pct / 100)).toFixed(2);
          })();
          const orderType = isStopLoss ? 'STOP_MARKET' : 'TAKE_PROFIT_MARKET';
          const params: Record<string, unknown> = {
            symbol: a.symbol,
            side: a.side,
            type: orderType,
            stopPrice: triggerPrice,
          };
          // Binance 要求 STOP_MARKET/TAKE_PROFIT_MARKET 必须显式传 closePosition，
          // 不能靠 undefined 占位（会被 JSON.stringify 丢弃）
          if (a.quantity && a.quantity !== '') {
            params.quantity = a.quantity;
          } else {
            params.closePosition = true;
          }
          if (a.positionSide) params.positionSide = a.positionSide;
          const r = await withRetry(async () => c.futuresOrder(params));
          return ok({ type: a.orderType, orderType, triggerPrice, order: r, timestamp: Date.now() });
        } catch (e) { logError(e as Error, { tool: 'futures_quick_order' }); return ok({ error: true, message: (e as Error).message }); }
      },
    },
  ];
}

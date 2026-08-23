/**
 * 工具定义 — 期货交易域（trading_*）
 *
 * 账户查询 / 订单查询 / 订单操作 / 持仓管理 / 条件单。仅在配置币安凭证时注册。
 * API 透传工具不声明 outputSchema（响应形状随官方演进，schema 校验反成负担）。
 *
 * @module tools/trading
 */

import { z } from "zod/v4";
import type {
  AlgoOrderType,
  AlgoTimeInForce,
  AutoCloseType,
  MarginType,
  OrderSide,
  TimeInForce,
} from "../exchange/types.js";
import {
  CALLBACK_RATE_MAX,
  CALLBACK_RATE_MIN,
  CLIENT_ORDER_ID_MAX_LENGTH,
  CLIENT_ORDER_ID_PATTERN,
  FORCE_ORDERS_DEFAULT_LIMIT,
  FORCE_ORDERS_MAX_LIMIT,
  GOOD_TILL_DATE_MAX,
  INCOME_HISTORY_DEFAULT_LIMIT,
  INCOME_HISTORY_MAX_LIMIT,
  MAX_LEVERAGE,
  ORDER_HISTORY_DEFAULT_LIMIT,
  ORDER_HISTORY_MAX_LIMIT,
  TRADES_DEFAULT_LIMIT,
  TRADES_MAX_LIMIT,
} from "../constants/index.js";
import { limitSchema, symbolSchema } from "../mcp/schema.js";
import type { ToolDef } from "../mcp/types.js";
import type { ToolContext } from "./index.js";

/** 查询类注解：只读 + 幂等 + 外部世界 */
const READ_ANNOTATIONS = { readOnlyHint: true, idempotentHint: true, openWorldHint: true } as const;
/** 写操作注解：非只读 + 外部世界 */
const WRITE_ANNOTATIONS = { readOnlyHint: false, destructiveHint: true, openWorldHint: true } as const;

/** 资产余额数组输出 schema（本域 trading_balance 专用） */
const balancesOutputSchema = z.object({
  data: z.array(
    z.object({
      asset: z.string(),
      balance: z.number(),
      availableBalance: z.number(),
      crossWalletBalance: z.number(),
      unrealizedProfit: z.number(),
    }),
  ),
});

/** 下单方向 */
const sideSchema = z.enum(["BUY", "SELL"]);
/** 普通订单类型（仅 LIMIT / MARKET） */
const orderTypeSchema = z.enum(["LIMIT", "MARKET"]);
/** 普通单有效期（与官方 NewOrderTimeInForceEnum 一致，含 RPI） */
const timeInForceSchema = z.enum(["GTC", "IOC", "FOK", "GTX", "GTD", "RPI"]);
/** 算法单有效期（官方 NewAlgoOrderTimeInForceEnum 仅支持 3 值） */
const algoTimeInForceSchema = z.enum(["GTC", "IOC", "FOK"]);
/**
 * 自定义订单号 schema（下单 newClientOrderId / 条件单 clientAlgoId 共用）
 *
 * 复用 constants 层官方正则（与 exchange 兜底校验同一模式），前置拦截非法字符与超长。
 */
const clientOrderIdSchema = z.string().refine(
  (v) => CLIENT_ORDER_ID_PATTERN.test(v),
  `订单号只能包含字母、数字、点、冒号、斜杠、下划线、连字符，长度 1-${CLIENT_ORDER_ID_MAX_LENGTH}`,
);
/** GTD 自动撤销时间 schema（官方上界 253402300799000，即 UTC 9999-12-31 23:59:59） */
const goodTillDateSchema = z
  .number()
  .int()
  .positive()
  .refine(
    (v) => v < GOOD_TILL_DATE_MAX,
    `goodTillDate 必须早于 ${GOOD_TILL_DATE_MAX}（UTC 9999-12-31 23:59:59）`,
  );
/** 算法单类型 */
const algoTypeSchema = z.enum([
  "STOP_MARKET", "TAKE_PROFIT_MARKET", "STOP", "TAKE_PROFIT", "TRAILING_STOP_MARKET",
]);
/** 保证金模式 */
const marginTypeSchema = z.enum(["ISOLATED", "CROSSED"]);
/** 收支流水类型（与官方 GetIncomeHistoryIncomeTypeEnum 枚举一致，官方包未导出该枚举对象） */
const incomeTypeSchema = z.enum([
  "TRANSFER", "WELCOME_BONUS", "REALIZED_PNL", "FUNDING_FEE", "COMMISSION",
  "INSURANCE_CLEAR", "REFERRAL_KICKBACK", "COMMISSION_REBATE", "API_REBATE",
  "CONTEST_REWARD", "CROSS_COLLATERAL_TRANSFER", "OPTIONS_PREMIUM_FEE",
  "OPTIONS_SETTLE_PROFIT", "INTERNAL_TRANSFER", "AUTO_EXCHANGE",
  "DELIVERED_SETTELMENT", "COIN_SWAP_DEPOSIT", "COIN_SWAP_WITHDRAW",
  "POSITION_LIMIT_INCREASE_FEE", "STRATEGY_UMFUTURES_TRANSFER", "FEE_RETURN",
  "BFUSD_REWARD",
]);

/**
 * 组装交易工具定义
 *
 * @param ctx - 工具上下文（须含 account / trade 服务）
 * @returns 交易工具定义列表；服务缺失时返回空数组
 */
export function buildTradingToolDefs(ctx: ToolContext): ToolDef[] {
  const trade = ctx.trade;
  const account = ctx.account;
  if (!trade || !account) return [];

  return [
    // ===================== 账户查询（5） =====================
    {
      name: "trading_balance",
      title: "资产余额",
      description: "返回：账户全部资产余额（含未实现盈亏）。",
      schema: z.object({}),
      outputSchema: balancesOutputSchema,
      annotations: READ_ANNOTATIONS,
      handler: () => account.getBalances(),
    },
    {
      name: "trading_account",
      title: "账户总览",
      description: "返回：钱包余额 / 未实现盈亏 / 保证金等汇总。",
      schema: z.object({}),
      outputSchema: z.object({
        totalWalletBalance: z.number(),
        totalUnrealizedProfit: z.number(),
        totalMarginBalance: z.number(),
        availableBalance: z.number(),
        totalPositionInitialMargin: z.number(),
        totalOpenOrderInitialMargin: z.number(),
      }),
      annotations: READ_ANNOTATIONS,
      handler: () => account.getAccountInfo(),
    },
    {
      name: "trading_positions",
      title: "持仓查询",
      description: "返回：当前持仓列表。缺省 symbol 返回全部持仓。",
      schema: z.object({ symbol: symbolSchema.optional() }),
      annotations: READ_ANNOTATIONS,
      handler: (args) =>
        account.getPositions(args.symbol !== undefined ? String(args.symbol) : undefined),
    },
    {
      name: "trading_income",
      title: "收支流水",
      description:
        "返回：资金费/手续费/已实现盈亏等流水记录。income 负数为支出。incomeType 合法值与官方枚举一致（如 FUNDING_FEE / COMMISSION / REALIZED_PNL）。",
      schema: z.object({
        symbol: symbolSchema.optional(),
        incomeType: incomeTypeSchema.optional(),
        startTime: z.number().int().optional(),
        endTime: z.number().int().optional(),
        limit: limitSchema(INCOME_HISTORY_DEFAULT_LIMIT, 1, INCOME_HISTORY_MAX_LIMIT),
      }),
      annotations: READ_ANNOTATIONS,
      handler: (args) =>
        account.getIncomeHistory({
          ...(args.symbol !== undefined ? { symbol: String(args.symbol) } : {}),
          ...(args.incomeType !== undefined ? { incomeType: String(args.incomeType) } : {}),
          ...(args.startTime !== undefined ? { startTime: Number(args.startTime) } : {}),
          ...(args.endTime !== undefined ? { endTime: Number(args.endTime) } : {}),
          ...(args.limit !== undefined ? { limit: Number(args.limit) } : {}),
        }),
    },
    {
      name: "trading_commission",
      title: "用户费率",
      description: "返回：指定交易对的 maker/taker 费率（含 VIP 折扣与 BNB 抵扣）。",
      schema: z.object({ symbol: symbolSchema }),
      outputSchema: z.object({
        symbol: z.string(),
        makerCommissionRate: z.number(),
        takerCommissionRate: z.number(),
      }),
      annotations: READ_ANNOTATIONS,
      handler: (args) => account.getCommissionRate(String(args.symbol)),
    },

    // ===================== 订单查询（5） =====================
    {
      name: "trading_get_order",
      title: "订单查询",
      description: "返回：指定订单详情。orderId 与 origClientOrderId 二选一。",
      schema: z.object({
        symbol: symbolSchema,
        orderId: z.number().int().optional(),
        origClientOrderId: z.string().optional(),
      }),
      annotations: READ_ANNOTATIONS,
      handler: (args) =>
        trade.getOrder({
          symbol: String(args.symbol),
          ...(args.orderId !== undefined ? { orderId: Number(args.orderId) } : {}),
          ...(args.origClientOrderId !== undefined
            ? { origClientOrderId: String(args.origClientOrderId) }
            : {}),
        }),
    },
    {
      name: "trading_open_orders",
      title: "未成交订单",
      description: "返回：当前全部未成交订单。symbol 可选。",
      schema: z.object({ symbol: symbolSchema.optional() }),
      annotations: READ_ANNOTATIONS,
      handler: (args) =>
        trade.getOpenOrders(args.symbol !== undefined ? String(args.symbol) : undefined),
    },
    {
      name: "trading_order_history",
      title: "历史订单",
      description: "返回：指定交易对的历史订单（时间倒序）。",
      schema: z.object({
        symbol: symbolSchema,
        orderId: z.number().int().optional(),
        startTime: z.number().int().optional(),
        endTime: z.number().int().optional(),
        limit: limitSchema(ORDER_HISTORY_DEFAULT_LIMIT, 1, ORDER_HISTORY_MAX_LIMIT),
      }),
      annotations: READ_ANNOTATIONS,
      handler: (args) =>
        trade.getOrderHistory({
          symbol: String(args.symbol),
          ...(args.orderId !== undefined ? { orderId: Number(args.orderId) } : {}),
          ...(args.startTime !== undefined ? { startTime: Number(args.startTime) } : {}),
          ...(args.endTime !== undefined ? { endTime: Number(args.endTime) } : {}),
          ...(args.limit !== undefined ? { limit: Number(args.limit) } : {}),
        }),
    },
    {
      name: "trading_force_orders",
      title: "强平订单",
      description: "返回：强平/自动减仓（ADL）订单记录。",
      schema: z.object({
        symbol: symbolSchema.optional(),
        autoCloseType: z.enum(["LIQUIDATION", "ADL"]).optional(),
        limit: limitSchema(FORCE_ORDERS_DEFAULT_LIMIT, 1, FORCE_ORDERS_MAX_LIMIT),
      }),
      annotations: READ_ANNOTATIONS,
      handler: (args) =>
        trade.getForceOrders({
          ...(args.symbol !== undefined ? { symbol: String(args.symbol) } : {}),
          ...(args.autoCloseType !== undefined
            ? { autoCloseType: args.autoCloseType as AutoCloseType }
            : {}),
          ...(args.limit !== undefined ? { limit: Number(args.limit) } : {}),
        }),
    },
    {
      name: "trading_trades",
      title: "成交记录",
      description: "返回：指定交易对的逐笔成交记录。",
      schema: z.object({
        symbol: symbolSchema,
        orderId: z.number().int().optional(),
        limit: limitSchema(TRADES_DEFAULT_LIMIT, 1, TRADES_MAX_LIMIT),
      }),
      annotations: READ_ANNOTATIONS,
      handler: (args) =>
        trade.getTrades({
          symbol: String(args.symbol),
          ...(args.orderId !== undefined ? { orderId: Number(args.orderId) } : {}),
          ...(args.limit !== undefined ? { limit: Number(args.limit) } : {}),
        }),
    },

    // ===================== 订单操作（4） =====================
    {
      name: "trading_place_order",
      title: "下单",
      description:
        "下单（自动精度规整）。dryRun=true 时仅校验不提交。reduceOnly 仅单向模式可用。timeInForce 为 GTD 时必须提供 goodTillDate。持仓模式约束：单向省略 positionSide，双向（Hedge）必须传 positionSide（LONG/SHORT），可用 trading_position_mode 查询。",
      schema: z
        .object({
          symbol: symbolSchema,
          side: sideSchema,
          type: orderTypeSchema,
          quantity: z.number().positive(),
          price: z.number().positive().optional(),
          timeInForce: timeInForceSchema.optional(),
          goodTillDate: goodTillDateSchema.optional(),
          reduceOnly: z.boolean().optional(),
          positionSide: z.enum(["LONG", "SHORT"]).optional(),
          newClientOrderId: clientOrderIdSchema.optional(),
          newOrderRespType: z.enum(["ACK", "RESULT"]).optional(),
          dryRun: z.boolean().default(false),
        })
        .superRefine((value, ctx) => {
          // 官方约束：timeInForce=GTD 时 goodTillDate 必填（订单取消时间）
          if (value.timeInForce === "GTD" && value.goodTillDate === undefined) {
            ctx.addIssue({
              code: "custom",
              message: "timeInForce 为 GTD 时必须提供 goodTillDate（订单取消时间，毫秒时间戳）",
              path: ["goodTillDate"],
            });
          }
          // 市价单即时成交、无有效期概念，误带 timeInForce 会被交易所拒绝，提前拦截
          if (value.type === "MARKET" && value.timeInForce !== undefined) {
            ctx.addIssue({
              code: "custom",
              message: "MARKET 市价单不支持 timeInForce（仅 LIMIT 限价单需要）",
              path: ["timeInForce"],
            });
          }
          // 官方约束：LIMIT 限价单必须提供委托价，提前拦截避免先付一次交易规则网络往返
          if (value.type === "LIMIT" && value.price === undefined) {
            ctx.addIssue({
              code: "custom",
              message: "LIMIT 限价单必须提供 price（委托价）",
              path: ["price"],
            });
          }
        }),
      annotations: WRITE_ANNOTATIONS,
      handler: (args) =>
        trade.placeOrder({
          symbol: String(args.symbol),
          side: args.side as OrderSide,
          type: args.type as "LIMIT" | "MARKET",
          quantity: Number(args.quantity),
          ...(args.price !== undefined ? { price: Number(args.price) } : {}),
          ...(args.timeInForce !== undefined
            ? { timeInForce: args.timeInForce as TimeInForce }
            : {}),
          ...(args.goodTillDate !== undefined ? { goodTillDate: Number(args.goodTillDate) } : {}),
          ...(args.reduceOnly !== undefined ? { reduceOnly: Boolean(args.reduceOnly) } : {}),
          ...(args.positionSide !== undefined
            ? { positionSide: args.positionSide as "LONG" | "SHORT" }
            : {}),
          ...(args.newClientOrderId !== undefined
            ? { newClientOrderId: String(args.newClientOrderId) }
            : {}),
          ...(args.newOrderRespType !== undefined
            ? { newOrderRespType: args.newOrderRespType as "ACK" | "RESULT" }
            : {}),
          dryRun: Boolean(args.dryRun),
        }),
    },
    {
      name: "trading_cancel_order",
      title: "撤单",
      description: "撤销指定订单。orderId 与 origClientOrderId 二选一。",
      schema: z.object({
        symbol: symbolSchema,
        orderId: z.number().int().optional(),
        origClientOrderId: z.string().optional(),
      }),
      annotations: WRITE_ANNOTATIONS,
      handler: (args) =>
        trade.cancelOrder({
          symbol: String(args.symbol),
          ...(args.orderId !== undefined ? { orderId: Number(args.orderId) } : {}),
          ...(args.origClientOrderId !== undefined
            ? { origClientOrderId: String(args.origClientOrderId) }
            : {}),
        }),
    },
    {
      name: "trading_cancel_all",
      title: "撤销全部未成交",
      description: "撤销指定交易对全部未成交订单。",
      schema: z.object({ symbol: symbolSchema }),
      annotations: WRITE_ANNOTATIONS,
      handler: (args) => trade.cancelAllOrders(String(args.symbol)),
    },
    {
      name: "trading_modify_order",
      title: "改单",
      description: "修改未成交订单（仅 LIMIT）。orderId 与 origClientOrderId 二选一。",
      schema: z.object({
        symbol: symbolSchema,
        side: sideSchema,
        quantity: z.number().positive(),
        price: z.number().positive(),
        orderId: z.number().int().optional(),
        origClientOrderId: z.string().optional(),
      }),
      annotations: WRITE_ANNOTATIONS,
      handler: (args) =>
        trade.modifyOrder({
          symbol: String(args.symbol),
          side: args.side as OrderSide,
          quantity: Number(args.quantity),
          price: Number(args.price),
          ...(args.orderId !== undefined ? { orderId: Number(args.orderId) } : {}),
          ...(args.origClientOrderId !== undefined
            ? { origClientOrderId: String(args.origClientOrderId) }
            : {}),
        }),
    },

    // ===================== 持仓管理（4） =====================
    {
      name: "trading_set_leverage",
      title: "设置杠杆",
      description: "设置交易对杠杆倍数（1~125，视交易对而定）。",
      schema: z.object({
        symbol: symbolSchema,
        leverage: z.number().int().min(1).max(MAX_LEVERAGE),
      }),
      outputSchema: z.object({
        symbol: z.string(),
        leverage: z.number(),
      }),
      annotations: WRITE_ANNOTATIONS,
      handler: (args) =>
        trade.setLeverage(String(args.symbol), Number(args.leverage)),
    },
    {
      name: "trading_set_margin_type",
      title: "设置保证金模式",
      description: "切换 ISOLATED（逐仓）/ CROSSED（全仓）。存在持仓时可能被拒绝。",
      schema: z.object({
        symbol: symbolSchema,
        marginType: marginTypeSchema,
      }),
      annotations: WRITE_ANNOTATIONS,
      handler: (args) =>
        trade.setMarginType(String(args.symbol), args.marginType as MarginType),
    },
    {
      name: "trading_position_margin",
      title: "调整逐仓保证金",
      description:
        "调整逐仓保证金。type: 1=增加，2=减少（官方枚举）；amount 恒为正数。双向（Hedge）模式下须提供 positionSide。",
      schema: z.object({
        symbol: symbolSchema,
        amount: z.number().positive(),
        type: z.union([z.literal(1), z.literal(2)]),
        positionSide: z.enum(["LONG", "SHORT"]).optional(),
      }),
      outputSchema: z.object({
        amount: z.number(),
        type: z.union([z.literal(1), z.literal(2)]),
      }),
      annotations: WRITE_ANNOTATIONS,
      handler: (args) =>
        trade.adjustPositionMargin({
          symbol: String(args.symbol),
          amount: Number(args.amount),
          type: args.type as 1 | 2,
          ...(args.positionSide !== undefined
            ? { positionSide: args.positionSide as "LONG" | "SHORT" }
            : {}),
        }),
    },
    {
      name: "trading_position_mode",
      title: "持仓模式",
      description:
        "查询并切换持仓模式。dual=true 双向（Hedge），false 单向（One-way）。缺省 dual 时仅查询。",
      schema: z.object({ dual: z.boolean().optional() }),
      // 该工具在提供 dual 时执行切换动作，故不标注为纯只读
      annotations: { readOnlyHint: false, openWorldHint: true },
      handler: (args) =>
        args.dual === undefined
          ? trade.getPositionMode()
          : trade
              .setPositionMode(Boolean(args.dual))
              .then(() => ({ dualSidePosition: Boolean(args.dual) })),
    },

    // ===================== 条件单（3） =====================
    {
      name: "trading_algo_orders",
      title: "条件单列表",
      description: "返回：当前挂出的未触发条件单。symbol 可选。",
      schema: z.object({ symbol: symbolSchema.optional() }),
      annotations: READ_ANNOTATIONS,
      handler: (args) =>
        trade.getAlgoOrders(args.symbol !== undefined ? String(args.symbol) : undefined),
    },
    {
      name: "trading_place_algo",
      title: "创建条件单",
      description: [
        "创建条件委托（止损/止盈/追踪止损）。type 决定必填参数：",
        "- STOP_MARKET / TAKE_PROFIT_MARKET：需 triggerPrice",
        "- STOP / TAKE_PROFIT：需 triggerPrice + price（限价委托价）",
        "- TRAILING_STOP_MARKET：需 callbackRate（百分比，0.1~10），可选 activatePrice",
        "触发价方向规则（违反将报 -2021 Order would immediately trigger）：",
        "- 止损类（STOP*）：BUY 须高于最新价，SELL 须低于最新价",
        "- 止盈类（TAKE_PROFIT*）：BUY 须低于最新价，SELL 须高于最新价",
        "closePosition=true 时触发后全平仓位，且要求该 symbol 已有对应方向持仓",
        "（无持仓时报错 GTE can only be used with open positions），不可传 quantity / reduceOnly。",
        "持仓模式：双向（Hedge）必须传 positionSide（LONG/SHORT），单向省略；可用 trading_position_mode 查询。",
      ].join("\n"),
      schema: z
        .object({
          symbol: symbolSchema,
          side: sideSchema,
          type: algoTypeSchema,
          positionSide: z.enum(["LONG", "SHORT"]).optional(),
          quantity: z.number().positive().optional(),
          price: z.number().positive().optional().describe("限价委托价，仅 STOP / TAKE_PROFIT 类型需要"),
          triggerPrice: z
            .number()
            .positive()
            .optional()
            .describe("触发价。止损类 BUY 须高于现价 / SELL 须低于现价，止盈类相反"),
          workingType: z.enum(["MARK_PRICE", "CONTRACT_PRICE"]).optional(),
          callbackRate: z
            .number()
            .min(CALLBACK_RATE_MIN)
            .max(CALLBACK_RATE_MAX)
            .optional()
            .describe("追踪止损回撤百分比（0.1~10，1=1%），仅 TRAILING_STOP_MARKET 需要"),
          activatePrice: z
            .number()
            .positive()
            .optional()
            .describe("追踪止损激活价，未达到前不开始追踪"),
          timeInForce: algoTimeInForceSchema.optional(),
          closePosition: z
            .boolean()
            .optional()
            .describe("触发后全平该合约仓位；为 true 时不可传 quantity / reduceOnly"),
          reduceOnly: z.boolean().optional(),
          priceProtect: z.boolean().optional(),
          clientAlgoId: clientOrderIdSchema.optional(),
        })
        .superRefine((value, ctx) => {
          // 官方约束：四类条件单的必填参数映射
          const needsTrigger = ["STOP_MARKET", "TAKE_PROFIT_MARKET", "STOP", "TAKE_PROFIT"].includes(
            value.type,
          );
          if (needsTrigger && value.triggerPrice === undefined) {
            ctx.addIssue({
              code: "custom",
              message: `${value.type} 必须提供 triggerPrice（触发价）`,
              path: ["triggerPrice"],
            });
          }
          if ((value.type === "STOP" || value.type === "TAKE_PROFIT") && value.price === undefined) {
            ctx.addIssue({
              code: "custom",
              message: `${value.type} 必须提供 price（限价委托价）`,
              path: ["price"],
            });
          }
          if (value.type === "TRAILING_STOP_MARKET" && value.callbackRate === undefined) {
            ctx.addIssue({
              code: "custom",
              message: "TRAILING_STOP_MARKET 必须提供 callbackRate（回撤百分比 0.1~10）",
              path: ["callbackRate"],
            });
          }
          // 官方约束：closePosition=true 与 quantity / reduceOnly 互斥
          if (value.closePosition === true) {
            if (value.quantity !== undefined) {
              ctx.addIssue({
                code: "custom",
                message: "closePosition=true 时不可传 quantity（触发后全平仓位）",
                path: ["quantity"],
              });
            }
            if (value.reduceOnly !== undefined) {
              ctx.addIssue({
                code: "custom",
                message: "closePosition=true 时不可传 reduceOnly",
                path: ["reduceOnly"],
              });
            }
          }
          // 官方约束：委托数量与全平标记二选一，缺失会被交易所 -1102 拒绝
          if (value.closePosition !== true && value.quantity === undefined) {
            ctx.addIssue({
              code: "custom",
              message: "必须提供 quantity 或 closePosition=true（二选一）",
              path: ["quantity"],
            });
          }
        }),
      annotations: WRITE_ANNOTATIONS,
      handler: (args) =>
        trade.placeAlgoOrder({
          symbol: String(args.symbol),
          side: args.side as OrderSide,
          type: args.type as AlgoOrderType,
          ...(args.positionSide !== undefined
            ? { positionSide: args.positionSide as "LONG" | "SHORT" }
            : {}),
          ...(args.quantity !== undefined ? { quantity: Number(args.quantity) } : {}),
          ...(args.price !== undefined ? { price: Number(args.price) } : {}),
          ...(args.triggerPrice !== undefined ? { triggerPrice: Number(args.triggerPrice) } : {}),
          ...(args.workingType !== undefined
            ? { workingType: args.workingType as "MARK_PRICE" | "CONTRACT_PRICE" }
            : {}),
          ...(args.callbackRate !== undefined ? { callbackRate: Number(args.callbackRate) } : {}),
          ...(args.activatePrice !== undefined
            ? { activatePrice: Number(args.activatePrice) }
            : {}),
          ...(args.timeInForce !== undefined
            ? { timeInForce: args.timeInForce as AlgoTimeInForce }
            : {}),
          ...(args.closePosition !== undefined
            ? { closePosition: Boolean(args.closePosition) }
            : {}),
          ...(args.reduceOnly !== undefined ? { reduceOnly: Boolean(args.reduceOnly) } : {}),
          ...(args.priceProtect !== undefined ? { priceProtect: Boolean(args.priceProtect) } : {}),
          ...(args.clientAlgoId !== undefined ? { clientAlgoId: String(args.clientAlgoId) } : {}),
        }),
    },
    {
      name: "trading_cancel_algo",
      title: "撤销条件单",
      description: "撤销条件单。clientAlgoId 与 algoId 二选一。",
      schema: z.object({
        clientAlgoId: z.string().optional(),
        algoId: z.number().int().optional(),
      }),
      annotations: WRITE_ANNOTATIONS,
      handler: (args) =>
        trade.cancelAlgoOrder({
          ...(args.clientAlgoId !== undefined
            ? { clientAlgoId: String(args.clientAlgoId) }
            : {}),
          ...(args.algoId !== undefined ? { algoId: Number(args.algoId) } : {}),
        }),
    },
  ];
}

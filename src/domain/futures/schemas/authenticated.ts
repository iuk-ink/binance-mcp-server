/**
 * Binance MCP Server — 期货认证工具 Zod Schema 定义
 *
 * @module domain/futures/schemas/authenticated
 * @description
 * 定义所有需要认证的期货交易和账户管理 MCP 工具的输入参数 Zod Schema，共 18 个。
 * 每个 Schema 使用 z.object({}).describe() 为字段附加 AI 可读的描述文本，
 * McpServer.registerTool() 会自动将 Zod Schema 转为 JSON Schema。
 */

import { z } from 'zod';

/**
 * 杠杆倍数参数
 *
 * 取值范围 1-125，对应 Binance 期货的最大杠杆上限
 */
const LeverageParam = z.number().min(1).max(125).describe('目标杠杆倍数 1-125');

/**
 * 通用可选时间范围
 *
 * 被多个 Schema 通过展开语法复用
 */
const TimeRange = {
  startTime: z.number().optional().describe('起始时间戳(ms)'),
  endTime: z.number().optional().describe('结束时间戳(ms)'),
};

// ---- 杠杆与保证金 ----

/** 调整杠杆倍数 */
export const FuturesLeverageSchema = z.object({
  symbol: z.string().describe('交易对符号'),
  leverage: LeverageParam,
});

/** 调整保证金模式：ISOLATED=逐仓，CROSSED=全仓 */
export const FuturesMarginTypeSchema = z.object({
  symbol: z.string().describe('交易对符号'),
  marginType: z.enum(['ISOLATED', 'CROSSED']).describe('保证金模式'),
});

/** 调整逐仓保证金 */
export const FuturesPositionMarginSchema = z.object({
  symbol: z.string().describe('交易对符号'),
  amount: z.string().describe('保证金金额'),
  type: z.union([z.literal(1), z.literal(2)]).describe('1:追加 2:减少'),
  positionSide: z.enum(['LONG', 'SHORT']).optional().describe('持仓方向（双向持仓必填）'),
});

/** 保证金变更历史 */
export const FuturesMarginHistorySchema = z.object({
  symbol: z.string().describe('交易对符号'),
  ...TimeRange,
  type: z.union([z.literal(1), z.literal(2)]).optional().describe('1:追加 2:减少'),
  limit: z.number().min(1).max(500).optional().default(500).describe('数量限制'),
});

// ---- 收益与成交 ----

/** 收益历史（资金费率/已实现盈亏/佣金等） */
export const FuturesIncomeSchema = z.object({
  symbol: z.string().optional().describe('交易对符号，不传获取所有'),
  incomeType: z
    .enum(['TRANSFER', 'WELCOME_BONUS', 'REALIZED_PNL', 'FUNDING_FEE', 'COMMISSION', 'INSURANCE_CLEAR'])
    .optional()
    .describe('收益类型'),
  ...TimeRange,
  limit: z.number().min(1).max(1000).optional().default(100).describe('数量限制'),
});

/** 账户成交历史 */
export const FuturesUserTradesSchema = z.object({
  symbol: z.string().describe('交易对符号'),
  ...TimeRange,
  limit: z.number().min(1).max(1000).optional().default(500).describe('数量限制'),
  fromId: z.number().optional().describe('起始成交ID（分页）'),
});

// ---- 杠杆分层 ----

/** 名义仓位杠杆分层信息 */
export const FuturesLeverageBracketSchema = z.object({
  symbol: z.string().optional().describe('交易对符号，不传获取所有'),
});

// ---- 下单与改单 ----

/** 期货下单 */
export const FuturesOrderSchema = z.object({
  symbol: z.string().describe('交易对符号'),
  side: z.enum(['BUY', 'SELL']).describe('买卖方向'),
  positionSide: z.enum(['LONG', 'SHORT']).optional().describe('持仓方向。账户处于双向持仓模式(Hedge Mode)时此参数必填，不传会报错'),
  type: z.enum(['LIMIT', 'MARKET', 'STOP', 'STOP_MARKET', 'TAKE_PROFIT', 'TAKE_PROFIT_MARKET', 'TRAILING_STOP_MARKET']).describe('订单类型。平仓建议：市价平仓=MARKET+SELL，止损平仓=STOP_MARKET+closePosition=true，止盈平仓=TAKE_PROFIT_MARKET+closePosition=true'),
  quantity: z.string().describe('数量（平仓止损止盈时用 closePosition=true 替代，无需传 quantity）'),
  price: z.string().optional().describe('价格（LIMIT/STOP 限价单必需）'),
  timeInForce: z.enum(['GTC', 'IOC', 'FOK', 'GTX']).optional().default('GTC').describe('有效期（仅 LIMIT 生效）'),
  reduceOnly: z.boolean().optional().describe('仅减仓（Hedge 模式下 SELL+LONG 会自动设为 true，无需手动传，传了反而可能报 not required）'),
  stopPrice: z.string().optional().describe('触发价（STOP/STOP_MARKET/TAKE_PROFIT_MARKET 必需）'),
  activationPrice: z.string().optional().describe('激活价格（TRAILING_STOP_MARKET 必需）。Binance 可能自动修正此值，最终生效价以返回的 activatePrice 为准'),
  callbackRate: z.string().optional().describe('回调幅度百分比（TRAILING_STOP_MARKET 必需，如"1"表示 1%）'),
  workingType: z.enum(['MARK_PRICE', 'CONTRACT_PRICE']).optional().default('CONTRACT_PRICE').describe('触发价类型'),
  closePosition: z.boolean().optional().describe('全仓平仓（仅 STOP_MARKET/TAKE_PROFIT_MARKET 支持，不支持 MARKET/LIMIT/TRAILING_STOP_MARKET）'),
});

/** 修改期货订单 — 仅 orderId + symbol 必填，但提示中建议传 side/type 避免出错 */
export const FuturesUpdateOrderSchema = z.object({
  orderId: z.number().describe('订单ID'),
  symbol: z.string().describe('交易对符号'),
  side: z.enum(['BUY', 'SELL']).optional().describe('买卖方向。建议修改订单时一并传入，避免 Binance 端校验不通过'),
  positionSide: z.enum(['LONG', 'SHORT']).optional().describe('持仓方向，双向持仓模式必填'),
  type: z.enum(['LIMIT', 'MARKET', 'STOP', 'STOP_MARKET', 'TAKE_PROFIT', 'TAKE_PROFIT_MARKET', 'TRAILING_STOP_MARKET']).optional().describe('订单类型。建议修改订单时一并传入，避免 Binance 端校验不通过'),
  quantity: z.string().optional().describe('数量（只改价格时可不传）'),
  price: z.string().optional().describe('价格'),
});

/** 查询单个期货订单 */
export const FuturesGetOrderSchema = z.object({
  symbol: z.string().describe('交易对符号'),
  orderId: z.number().optional().describe('订单ID'),
  origClientOrderId: z.string().optional().describe('客户端订单ID'),
});

/** 获取期货全部订单（含历史） */
export const FuturesAllOrdersSchema = z.object({
  symbol: z.string().describe('交易对符号'),
  orderId: z.number().optional().describe('起始订单ID'),
  ...TimeRange,
  limit: z.number().min(1).max(1000).optional().default(500).describe('数量限制'),
});

/** 批量下单（最多5单） */
export const FuturesBatchOrdersSchema = z.object({
  batchOrders: z.array(z.object({
    symbol: z.string(),
    side: z.enum(['BUY', 'SELL']),
    positionSide: z.enum(['LONG', 'SHORT']).optional().describe('持仓方向，双向持仓模式(Hedge Mode)必填'),
    type: z.enum(['LIMIT', 'MARKET', 'STOP', 'STOP_MARKET', 'TAKE_PROFIT_MARKET', 'TRAILING_STOP_MARKET']),
    quantity: z.string(),
    price: z.string().optional(),
    timeInForce: z.enum(['GTC', 'IOC', 'FOK']).optional().default('GTC'),
    reduceOnly: z.boolean().optional().describe('仅减仓'),
  })).describe('批量订单，最多5单'),
});

/** 批量取消订单 — 参数统一为数组类型，handler 内自动 JSON 序列化 */
export const FuturesCancelBatchOrdersSchema = z.object({
  symbol: z.string().describe('交易对符号'),
  orderIdList: z.array(z.number()).optional().describe('要取消的订单ID列表，如 [123, 456]'),
  origClientOrderIdList: z.array(z.string()).optional().describe('要取消的客户端订单ID列表'),
});

// ---- 单笔取消 + 活跃订单 ----

/** 单笔取消订单（支持条件单） */
export const FuturesCancelOrderSchema = z.object({
  symbol: z.string().describe('交易对符号'),
  orderId: z.number().optional().describe('订单ID（普通订单）'),
  origClientOrderId: z.string().optional().describe('客户端订单ID（普通订单）'),
  algoId: z.number().optional().describe('条件单 algoId（STOP/TAKE_PROFIT/TRAILING 等）'),
  clientAlgoId: z.string().optional().describe('条件单客户端ID'),
});

/** 取消全部活跃订单 — 危险操作，需传 confirm="CONFIRM" 确认 */
export const FuturesCancelAllOpenOrdersSchema = z.object({
  symbol: z.string().describe('交易对符号'),
  confirm: z.literal('CONFIRM').describe('输入 CONFIRM 确认执行一键清仓。此操作不可撤销'),
});

/** 查询活跃订单（含条件单） */
export const FuturesOpenOrdersSchema = z.object({
  symbol: z.string().optional().describe('交易对符号，不传获取所有'),
});

// ---- 辅助工具 ----

/** 账户持仓全景报告 — 默认紧凑模式（去重）并过滤零持仓 */
export const FuturesAccountReportSchema = z.object({
  hideZeroPositions: z.boolean().optional().default(true)
    .describe('是否过滤零持仓，默认 true。设为 false 可查看历史全部持仓'),
  compact: z.boolean().optional().default(true)
    .describe('精简模式（默认）。true=去重返回（省 token），false=完整返回 balances+accountInfo 全部字段'),
});

/** 一键止损/止盈 — 根据当前价格和百分比偏移自动计算触发价并下条件单 */
export const FuturesQuickOrderSchema = z.object({
  symbol: z.string().describe('交易对符号'),
  side: z.enum(['BUY', 'SELL']).describe('持仓方向对应的平仓方向'),
  positionSide: z.enum(['LONG', 'SHORT']).optional().describe('持仓方向，双向持仓模式必填'),
  orderType: z.enum(['STOP_LOSS', 'TAKE_PROFIT']).describe('订单类型：STOP_LOSS=止损, TAKE_PROFIT=止盈'),
  currentPrice: z.string().describe('当前参考价格'),
  offsetPercent: z.string().describe('偏移百分比，如"5"表示 5%。止损=低于现价，止盈=高于现价'),
  quantity: z.string().optional().describe('平仓数量，不传则传 closePosition=true 全平'),
});

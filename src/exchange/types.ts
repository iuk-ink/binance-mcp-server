/**
 * 币安操作模块 — 业务类型定义
 *
 * 设计要点：
 * - 所有数值字段由官方包的字符串类型转换为 number，避免字符串陷阱
 * - 时间戳统一为毫秒 number
 * - 类型定义与官方包响应结构对应（字段来源已在注释中标注），但语义化命名
 *
 * @module exchange/types
 */

// ============================================================================
//  行情
// ============================================================================

/**
 * 单交易对最新价行情
 *
 * 对应官方 `symbolPriceTickerV2` 响应。
 */
export interface SymbolTicker {
  /** 交易对，如 BTCUSDT */
  symbol: string;
  /** 最新成交价 */
  price: number;
}

/**
 * 标记价行情（含资金费率信息）
 *
 * 对应官方 `markPrice` 响应。
 */
export interface MarkPriceData {
  /** 交易对，如 BTCUSDT */
  symbol: string;
  /** 标记价 */
  markPrice: number;
  /** 最新资金费率（官方 lastFundingRate） */
  fundingRate?: number;
  /** 下次资金费率结算时间 ms（官方 nextFundingTime） */
  nextFundingTime?: number;
  /** 指数价格（官方 indexPrice） */
  indexPrice?: number;
}

/**
 * 一根 K 线（开盘时间 → 收盘时间）
 *
 * 对应官方 `klineCandlestickData` 响应的扁平元组（12 位），
 * 业务层保留前 11 个有效字段，末位 ignore（恒为 0）丢弃。
 */
export interface Kline {
  /** 开盘时间 ms（元组下标 0） */
  openTime: number;
  /** 开盘价（下标 1） */
  open: number;
  /** 最高价（下标 2） */
  high: number;
  /** 最低价（下标 3） */
  low: number;
  /** 收盘价（下标 4） */
  close: number;
  /** 成交量，基础资产单位（下标 5） */
  volume: number;
  /** 收盘时间 ms（下标 6） */
  closeTime: number;
  /** 成交额，报价资产 USDT（下标 7） */
  quoteVolume: number;
  /** 成交笔数（下标 8） */
  trades: number;
  /** 主动买入成交量，基础资产单位（下标 9） */
  takerBuyVolume: number;
  /** 主动买入成交额，USDT（下标 10） */
  takerQuoteVolume: number;
}

/** K 线周期（与官方 KlineCandlestickDataIntervalEnum 一致） */
export type KlineInterval =
  | "1m" | "3m" | "5m" | "15m" | "30m" | "1h"
  | "2h" | "4h" | "6h" | "8h" | "12h" | "1d"
  | "3d" | "1w" | "1M";

/** 数据统计周期（用于情绪/结构类端点） */
export type StatsPeriod = "5m" | "15m" | "30m" | "1h" | "2h" | "4h" | "6h" | "12h" | "1d";

/** 连续合约类型（与官方 ContinuousContractKlineCandlestickDataContractTypeEnum 一致） */
export type ContractType = "PERPETUAL" | "CURRENT_QUARTER" | "NEXT_QUARTER" | "TRADIFI_PERPETUAL";

/**
 * 24h 滚动行情统计
 *
 * 对应官方 `ticker24hrPriceChangeStatistics` 响应。
 */
export interface Ticker24h {
  /** 交易对，如 BTCUSDT */
  symbol: string;
  /** 最新成交价 */
  lastPrice: number;
  /** 24h 涨跌幅（%，如 3.5 表示涨 3.5%） */
  priceChangePercent: number;
  /** 24h 最高价 */
  highPrice: number;
  /** 24h 最低价 */
  lowPrice: number;
  /** 24h 成交量（基础资产单位） */
  volume: number;
  /** 24h 成交额（USDT） */
  quoteVolume: number;
  /** 24h 加权均价 */
  weightedAvgPrice: number;
  /** 24h 成交笔数 */
  count: number;
  /** 24h 起始价 */
  openPrice: number;
}

/** 订单簿档位：[价格, 数量] */
export type OrderBookLevel = readonly [price: number, quantity: number];

/** 订单簿快照（对应官方 orderBook 响应） */
export interface OrderBook {
  /** 订单簿最后更新 ID */
  lastUpdateId: number;
  /** 买盘档位（价格升序） */
  bids: OrderBookLevel[];
  /** 卖盘档位（价格升序） */
  asks: OrderBookLevel[];
}

/** 最优买卖报价（对应官方 symbolOrderBookTicker 响应） */
export interface BookTicker {
  /** 交易对 */
  symbol: string;
  /** 最优买价 */
  bidPrice: number;
  /** 最优买量 */
  bidQty: number;
  /** 最优卖价 */
  askPrice: number;
  /** 最优卖量 */
  askQty: number;
}

/** 未平仓量（对应官方 openInterest 响应） */
export interface OpenInterestData {
  /** 交易对 */
  symbol: string;
  /** 未平仓量（基础资产单位） */
  openInterest: number;
  /** 时间 ms */
  time: number;
}

/** 当前资金费率（对应官方 getFundingRateInfo 响应元素） */
export interface FundingRateInfo {
  /** 交易对 */
  symbol: string;
  /** 资金费率上限 */
  adjustedFundingRateCap?: number;
  /** 资金费率下限 */
  adjustedFundingRateFloor?: number;
  /** 资金费率结算间隔（小时） */
  fundingIntervalHours: number;
}

/** 历史资金费率（对应官方 getFundingRateHistory 响应元素） */
export interface FundingRateHistory {
  /** 交易对 */
  symbol: string;
  /** 资金费率 */
  fundingRate: number;
  /** 结算时间 ms */
  fundingTime: number;
  /** 结算时的标记价 */
  markPrice: number;
  /** 费率类型（Regular / Special） */
  rateType?: string;
}

/** 历史 OI 统计（对应官方 openInterestStatistics 响应元素） */
export interface OIHistData {
  /** 交易对 */
  symbol: string;
  /** OI 总量（基础资产单位） */
  sumOpenInterest: number;
  /** OI 总价值（USDT） */
  sumOpenInterestValue: number;
  /** 时间 ms */
  timestamp: number;
}

/** 多空比（对应官方 longShortRatio 响应元素） */
export interface LongShortRatio {
  /** 交易对 */
  symbol: string;
  /** 多空账户数比 */
  longShortRatio: number;
  /** 多头账户数占比 */
  longAccount: number;
  /** 空头账户数占比 */
  shortAccount: number;
  /** 时间 ms */
  timestamp: number;
}

/** 主动买卖量（对应官方 takerBuySellVolume 响应元素） */
export interface TakerVolume {
  /** 交易对 */
  symbol: string;
  /** 买卖比 */
  buySellRatio: number;
  /** 主动买入量 */
  buyVol: number;
  /** 主动卖出量 */
  sellVol: number;
  /** 时间 ms */
  timestamp: number;
}

/** 大户持仓比（对应官方 topTraderLongShortRatioAccounts 响应元素） */
export interface TopTraderRatio {
  /** 交易对 */
  symbol: string;
  /** 多空比 */
  longShortRatio: number;
  /** 多头账户数占比 */
  longAccount: number;
  /** 空头账户数占比 */
  shortAccount: number;
  /** 时间 ms */
  timestamp: number;
}

/**
 * 交易对精度与限制
 *
 * 从 exchangeInformation 过滤器中提取。
 */
export interface SymbolSpec {
  /** 交易对，如 BTCUSDT */
  symbol: string;
  /** 价格小数位（由 tickSize 推导） */
  pricePrecision: number;
  /** 数量小数位（由 stepSize 推导） */
  quantityPrecision: number;
  /** 最小价格步进 */
  tickSize: number;
  /** 最小数量步进 */
  stepSize: number;
  /** 最小名义价值 */
  minNotional: number;
  /** 交易状态：TRADING / BREAK / PAUSED */
  status: string;
}

// ============================================================================
//  账户
// ============================================================================

/** 持仓方向 */
export type PositionSide = "BOTH" | "LONG" | "SHORT";

/** 保证金模式 */
export type MarginType = "ISOLATED" | "CROSSED";

/** 持仓（对应官方 positionInformationV3 响应元素） */
export interface Position {
  /** 交易对 */
  symbol: string;
  /** 持仓方向 */
  positionSide: PositionSide;
  /** 持仓量（正数多仓，负数空仓） */
  positionAmt: number;
  /** 开仓均价 */
  entryPrice: number;
  /** 当前标记价 */
  markPrice: number;
  /** 未实现盈亏 */
  unRealizedProfit: number;
  /** 强平价格（0 表示未计算） */
  liquidationPrice: number;
  /** 保证金模式（ISOLATED / CROSSED） */
  marginType: string;
  /** 名义价值 */
  notional: number;
  /** 初始保证金 */
  initialMargin: number;
  /** 维持保证金 */
  maintMargin: number;
  /** 更新时间 ms */
  updateTime: number;
}

/** 资产余额（对应官方 futuresAccountBalanceV3 响应元素） */
export interface AssetBalance {
  /** 资产名称，如 USDT */
  asset: string;
  /** 钱包余额 */
  balance: number;
  /** 可用余额 */
  availableBalance: number;
  /** 跨仓钱包余额 */
  crossWalletBalance: number;
  /** 未实现盈亏 */
  unrealizedProfit: number;
}

/** 账户总览（对应官方 accountInformationV3 响应） */
export interface AccountInfo {
  /** 钱包总余额 */
  totalWalletBalance: number;
  /** 未实现总盈亏 */
  totalUnrealizedProfit: number;
  /** 保证金总余额 */
  totalMarginBalance: number;
  /** 可用余额 */
  availableBalance: number;
  /** 持仓初始保证金 */
  totalPositionInitialMargin: number;
  /** 挂单初始保证金 */
  totalOpenOrderInitialMargin: number;
}

/** 持仓模式（对应官方 getCurrentPositionMode 响应） */
export interface PositionMode {
  /** true=双向（Hedge），false=单向（One-way） */
  dualSidePosition: boolean;
}

/** 逐币对用户费率（对应官方 userCommissionRate 响应） */
export interface CommissionRate {
  /** 交易对 */
  symbol: string;
  /** Maker 费率（小数，如 0.0002 = 0.02%） */
  makerCommissionRate: number;
  /** Taker 费率（小数，如 0.0004 = 0.04%） */
  takerCommissionRate: number;
}

/** 收支流水记录（对应官方 getIncomeHistory 响应元素） */
export interface IncomeRecord {
  /** 交易对（可空） */
  symbol: string | null;
  /** 流水类型 */
  incomeType: string;
  /** 金额（负数=支出，正数=收入） */
  income: number;
  /** 资产 */
  asset: string | null;
  /** 发生时间 ms */
  time: number;
  /** 交易 ID（19 位超 Number 安全整数范围，保留字符串防精度丢失） */
  tranId: string;
}

/** 查询收支流水的参数 */
export interface IncomeQueryParams {
  symbol?: string;
  incomeType?: string;
  startTime?: number;
  endTime?: number;
  limit?: number;
}

// ============================================================================
//  订单
// ============================================================================

/** 下单方向 */
export type OrderSide = "BUY" | "SELL";

/** 订单类型 */
export type OrderType =
  | "LIMIT" | "MARKET"
  | "STOP" | "STOP_MARKET"
  | "TAKE_PROFIT" | "TAKE_PROFIT_MARKET"
  | "TRAILING_STOP_MARKET";

/** 普通单有效期方式（与官方 NewOrderTimeInForceEnum 一致） */
export type TimeInForce = "GTC" | "IOC" | "FOK" | "GTX" | "GTD" | "RPI";

/** 算法单有效期方式（官方 NewAlgoOrderTimeInForceEnum 仅支持 3 值） */
export type AlgoTimeInForce = "GTC" | "IOC" | "FOK";

/** 订单状态（币安 USD-M 期货全量状态） */
export type OrderStatus =
  | "NEW" | "PARTIALLY_FILLED" | "FILLED"
  | "CANCELED" | "REJECTED" | "EXPIRED"
  | "NEW_INSURANCE" | "NEW_ADL";

/** 下单结果状态：订单状态 + dry-run 业务伪状态（未真正提交订单） */
export type OrderResultStatus = OrderStatus | "DRY_RUN";

/**
 * 下单 / 查询 / 撤单统一结果
 */
export interface OrderResult {
  /** 交易所订单号 */
  orderId: number;
  /** 自定义订单号 */
  clientOrderId: string;
  /** 交易对 */
  symbol: string;
  /** 下单方向 */
  side: OrderSide;
  /** 订单类型 */
  type: OrderType;
  /** 订单状态（dry-run 校验通过时为 DRY_RUN） */
  status: OrderResultStatus;
  /** 下单价格 */
  price: number;
  /** 原始数量 */
  origQty: number;
  /** 已成交数量 */
  executedQty: number;
  /** 平均成交价 */
  avgPrice: number;
  /** 是否只减仓 */
  reduceOnly: boolean;
  /** 持仓方向（Hedge 模式返回） */
  positionSide?: PositionSide;
  /** 更新时间 ms */
  updateTime?: number;
  /** 是否为 dry-run 校验结果（未真正提交订单） */
  dryRun?: boolean;
}

/** 查询订单参数 */
export interface OrderQueryParams {
  symbol: string;
  orderId?: number;
  origClientOrderId?: string;
}

/** 订单历史查询参数 */
export interface OrderHistoryParams {
  symbol: string;
  orderId?: number;
  startTime?: number;
  endTime?: number;
  limit?: number;
}

/** 成交记录（对应官方 accountTradeList 响应元素） */
export interface TradeRecord {
  /** 交易对 */
  symbol: string;
  /** 交易 ID */
  id: number;
  /** 订单号 */
  orderId: number;
  /** 成交价格 */
  price: number;
  /** 成交数量 */
  qty: number;
  /** 成交额 */
  quoteQty: number;
  /** 手续费 */
  commission: number;
  /** 手续费资产 */
  commissionAsset: string;
  /** 成交时间 ms */
  time: number;
  /** 是否买方 */
  isBuyer: boolean;
  /** 是否做市 */
  isMaker: boolean;
  /** 是否实现盈亏 */
  realizedPnl: number;
}

/** 强平类型（官方枚举：强平 / 自动减仓） */
export type AutoCloseType = "LIQUIDATION" | "ADL";

/** 强平订单查询参数 */
export interface ForceOrdersParams {
  symbol?: string;
  autoCloseType?: AutoCloseType;
  limit?: number;
}

/**
 * 下单参数（业务层最小集）
 *
 * 对应官方 newOrder 请求参数；dryRun 为业务层扩展，
 * 开启时仅做精度规整与合法性校验，不真正提交订单。
 */
export interface NewOrderParams {
  /** 交易对，如 BTCUSDT */
  symbol: string;
  /** 下单方向 */
  side: OrderSide;
  /**
   * 订单类型。业务层限定 LIMIT / MARKET（普通单接口虽支持条件类型，
   * 条件单统一由算法单接口 {@link NewAlgoOrderParams} 提交）。
   */
  type: "LIMIT" | "MARKET";
  /** 下单数量（基础资产单位） */
  quantity: number;
  /** 价格（LIMIT 必填，市价单无需） */
  price?: number;
  /** 有效期（LIMIT 默认 GTC） */
  timeInForce?: TimeInForce;
  /** 订单取消时间 ms（timeInForce 为 GTD 时必填，秒级精度） */
  goodTillDate?: number;
  /** 只减仓（平仓时防开仓）；仅 One-way 模式可用，Hedge 模式禁止传入 */
  reduceOnly?: boolean;
  /** 持仓方向。Hedge 模式下必填 LONG / SHORT；One-way 模式下禁止传入 */
  positionSide?: "LONG" | "SHORT";
  /** 自定义订单号（幂等控制） */
  newClientOrderId?: string;
  /** 下单响应模式：ACK 仅确认，RESULT 返回成交明细 */
  newOrderRespType?: "ACK" | "RESULT";
  /** 测试模式：仅校验与规整，不真正提交订单（dry-run） */
  dryRun?: boolean;
}

/** 强平订单（对应官方 usersForceOrders 响应元素） */
export interface ForceOrderRecord {
  /** 交易对 */
  symbol: string;
  /** 订单号 */
  orderId: number;
  /** 触发价格 */
  avgPrice: number;
  /** 强平数量 */
  executedQty: number;
  /** 原始数量 */
  origQty: number;
  /** 强平类型：LIQUIDATION / ADL */
  autoCloseType: string;
  /** 持仓方向 */
  positionSide: PositionSide;
  /** 方向 */
  side: OrderSide;
  /** 触发时间 ms */
  time: number;
}

/** 逐仓保证金调整参数（对应官方 modifyIsolatedPositionMargin 请求） */
export interface AdjustMarginParams {
  /** 交易对 */
  symbol: string;
  /** 调整金额（恒为正数，方向由 type 决定） */
  amount: number;
  /** 调整类型：1=增加保证金，2=减少保证金（官方枚举） */
  type: 1 | 2;
  /** 持仓方向（双向持仓模式下必填） */
  positionSide?: "LONG" | "SHORT";
}

/** 逐仓保证金调整结果 */
export interface AdjustMarginResult {
  /** 调整后保证金数量 */
  amount: number;
  /** 调整类型：1=增加保证金，2=减少保证金 */
  type: 1 | 2;
}

// ============================================================================
//  算法单
// ============================================================================

/** 算法单类型 */
export type AlgoOrderType =
  | "STOP_MARKET" | "TAKE_PROFIT_MARKET"
  | "STOP" | "TAKE_PROFIT"
  | "TRAILING_STOP_MARKET";

/** 创建算法单参数 */
export interface NewAlgoOrderParams {
  symbol: string;
  side: OrderSide;
  type: AlgoOrderType;
  positionSide?: PositionSide;
  quantity?: number;
  price?: number;
  triggerPrice?: number;
  workingType?: "MARK_PRICE" | "CONTRACT_PRICE";
  callbackRate?: number;
  activatePrice?: number;
  timeInForce?: AlgoTimeInForce;
  closePosition?: boolean;
  reduceOnly?: boolean;
  priceProtect?: boolean;
  clientAlgoId?: string;
}

/** 创建算法单结果 */
export interface AlgoOrderResult {
  /** 算法单 ID */
  algoId: number;
  /** 幂等算法单 ID */
  clientAlgoId: string;
  /** 算法类型 */
  algoType: string;
  /** 委托单类型 */
  orderType: AlgoOrderType;
  /** 交易对 */
  symbol: string;
  /** 方向 */
  side: OrderSide;
  /** 持仓方向 */
  positionSide: PositionSide;
  /** 委托状态 */
  algoStatus: string;
  /** 委托数量 */
  quantity: number;
  /** 委托价格 */
  price: number;
  /** 触发价格 */
  triggerPrice: number;
}

/** 当前挂出的算法单 */
export interface AlgoOrderInfo {
  /** 算法单 ID */
  algoId: number;
  /** 幂等算法单 ID */
  clientAlgoId: string;
  /** 算法类型 */
  algoType: string;
  /** 委托单类型 */
  orderType: AlgoOrderType;
  /** 交易对 */
  symbol: string;
  /** 方向 */
  side: OrderSide;
  /** 持仓方向 */
  positionSide: PositionSide;
  /** 委托状态 */
  algoStatus: string;
  /** 委托数量 */
  quantity: number;
  /** 委托价格 */
  price: number;
  /** 触发价格 */
  triggerPrice: number;
  /** 触发价类型 */
  workingType?: string;
  /** 更新时间 ms */
  updateTime?: number | null;
}

/** 撤销算法单参数 */
export interface CancelAlgoOrderParams {
  clientAlgoId?: string;
  algoId?: number;
}

/** 杠杆设置结果 */
export interface LeverageResult {
  /** 交易对 */
  symbol: string;
  /** 实际生效杠杆倍数 */
  leverage: number;
}

// ============================================================================
//  公共
// ============================================================================

/** K 线查询参数 */
export interface KlineParams {
  symbol: string;
  interval: KlineInterval;
  startTime?: number;
  endTime?: number;
  limit?: number;
}

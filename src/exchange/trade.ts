/**
 * 币安操作模块 — 交易服务（签名请求）
 *
 * 封装官方包 Trade API：
 * - 下单（下单前自动做精度规整 + 幂等 clientOrderId）
 * - 撤单 / 批量撤单 / 改单 / 订单查询
 * - 杠杆、保证金模式、逐仓保证金调整、持仓模式
 * - 算法单（条件委托：止损 / 止盈 / 追踪止损）
 *
 * 注意：官方包 NewOrderRequest 的 reduceOnly 为字符串枚举 "true"/"false"，
 * 由布尔自动转换。
 *
 * @module exchange/trade
 */

import type {
  DerivativesTradingUsdsFutures,
  DerivativesTradingUsdsFuturesRestAPI,
} from "@binance/derivatives-trading-usds-futures";
import { randomUUID } from "node:crypto";
import {
  BINANCE_ERROR_CODE_BACKEND_TIMEOUT,
  CLIENT_ORDER_ID_PATTERN,
} from "../constants/index.js";
import { createLogger, type Logger } from "../utils/logger.js";
import { fromConnectorError, makeExchangeError } from "./errors.js";
import { isAboveMinNotional, roundPrice, roundQuantity } from "./format.js";
import { safeCall, withRecvWindow } from "./request.js";
import type { MarketService } from "./market.js";
import type {
  AdjustMarginParams,
  AdjustMarginResult,
  AlgoOrderInfo,
  AlgoOrderResult,
  AlgoOrderType,
  CancelAlgoOrderParams,
  ForceOrderRecord,
  ForceOrdersParams,
  LeverageResult,
  MarginType,
  NewAlgoOrderParams,
  NewOrderParams,
  OrderHistoryParams,
  OrderQueryParams,
  OrderResult,
  OrderSide,
  OrderStatus,
  OrderType,
  PositionMode,
  PositionSide,
  TradeRecord,
} from "./types.js";

/**
 * 交易服务
 *
 * 依赖 MarketService 获取精度规格，下单前完成规整。
 */
export class TradeService {
  /**
   * @param client     - 官方包客户端（由 getClient 提供）
   * @param market     - 行情服务（用于精度规整）
   * @param recvWindow - 请求窗口 ms（未配置则不入参）
   * @param logger     - 日志记录器（缺省自建 exchange.trade 子记录器）
   */
  constructor(
    private readonly client: DerivativesTradingUsdsFutures,
    private readonly market: MarketService,
    private readonly recvWindow?: number,
    private readonly logger: Logger = createLogger({ name: "exchange" }).child({
      component: "trade",
    }),
  ) {}

  // ==========================================================================
  //  普通下单
  // ==========================================================================

  /**
   * 下单（自动精度规整 + 幂等 clientOrderId）
   *
   * @param params - 下单参数
   * @returns 下单结果
   * @throws {ExchangeError} 参数非法或精度不满足时抛出
   */
  async placeOrder(params: NewOrderParams): Promise<OrderResult> {
    const normalized = await this.normalizeOrder(params);

    if (params.dryRun) {
      this.logger.info("下单（dry-run 校验通过）", {
        symbol: normalized.symbol,
        quantity: normalized.quantity,
        price: normalized.price,
      });
      return {
        orderId: 0,
        clientOrderId: normalized.newClientOrderId ?? "",
        symbol: normalized.symbol,
        side: normalized.side,
        type: normalized.type,
        status: "DRY_RUN",
        price: normalized.price ?? 0,
        origQty: normalized.quantity,
        executedQty: 0,
        avgPrice: 0,
        reduceOnly: normalized.reduceOnly ?? false,
        positionSide: normalized.positionSide,
        dryRun: true,
      };
    }

    const clientOrderId = normalized.newClientOrderId ?? this.genClientOrderId();

    try {
      // 官方请求字段为 readonly 且含字符串枚举，条件展开构造字面量，枚举字段按官方类型精确断言
      const data = await safeCall(() =>
        this.client.restAPI.newOrder({
          symbol: normalized.symbol,
          side: normalized.side as DerivativesTradingUsdsFuturesRestAPI.NewOrderSideEnum,
          type: normalized.type as DerivativesTradingUsdsFuturesRestAPI.NewOrderTypeEnum,
          quantity: normalized.quantity,
          ...(normalized.price !== undefined ? { price: normalized.price } : {}),
          ...(normalized.timeInForce !== undefined
            ? {
                timeInForce:
                  normalized.timeInForce as DerivativesTradingUsdsFuturesRestAPI.NewOrderTimeInForceEnum,
              }
            : {}),
          ...(normalized.goodTillDate !== undefined
            ? { goodTillDate: normalized.goodTillDate }
            : {}),
          // 官方 reduceOnly 为 'true'/'false' 字符串枚举，统一转字符串
          ...(normalized.reduceOnly !== undefined
            ? {
                reduceOnly: String(
                  normalized.reduceOnly,
                ) as DerivativesTradingUsdsFuturesRestAPI.NewOrderReduceOnlyEnum,
              }
            : {}),
          ...(normalized.positionSide !== undefined
            ? { positionSide: normalized.positionSide }
            : {}),
          newClientOrderId: clientOrderId,
          newOrderRespType: (params.newOrderRespType ??
            "ACK") as DerivativesTradingUsdsFuturesRestAPI.NewOrderNewOrderRespTypeEnum,
          ...this.withRecvWindow({}),
        }),
      );
      this.logger.info("下单成功", {
        symbol: normalized.symbol,
        orderId: Number(data.orderId),
        status: data.status,
      });
      const result = this.mapOrderResult(data as Record<string, unknown>, normalized.symbol);
      // 响应字段缺失时用请求参数兜底
      result.side = (data.side ?? normalized.side) as OrderSide;
      result.type = (data.type ?? normalized.type) as OrderType;
      result.price = Number(data.price ?? normalized.price ?? 0);
      result.origQty = Number(data.origQty ?? normalized.quantity);
      if (data.reduceOnly == null) {
        result.reduceOnly = normalized.reduceOnly ?? false;
      }
      return result;
    } catch (err) {
      const exchangeErr = fromConnectorError(err);
      this.logger.warn("下单失败", {
        symbol: normalized.symbol,
        error: exchangeErr.message,
        code: exchangeErr.code,
      });
      // -1007 后端超时：请求是否成交状态未知，按幂等单查证后决定是否返回已成交结果
      if (exchangeErr.code === BINANCE_ERROR_CODE_BACKEND_TIMEOUT) {
        const recovered = await this.tryRecoverOrderAfterTimeout(
          normalized.symbol,
          clientOrderId,
        );
        if (recovered) return recovered;
      }
      throw exchangeErr;
    }
  }

  /**
   * -1007 后端超时后查证订单是否已成交（best-effort）
   *
   * 以本次下单使用的幂等 clientOrderId 查询；查不到（$2013）或查证本身失败时
   * 返回 undefined，交由调用方上抛原始超时异常。
   *
   * @param symbol        - 交易对
   * @param clientOrderId - 下单时使用的幂等订单号
   * @returns 查证到的订单结果；确认为未成交 / 查询失败则返回 undefined
   */
  private async tryRecoverOrderAfterTimeout(
    symbol: string,
    clientOrderId: string,
  ): Promise<OrderResult | undefined> {
    try {
      const data = await safeCall(() =>
        this.client.restAPI.queryOrder({
          symbol,
          origClientOrderId: clientOrderId,
          ...this.withRecvWindow({}),
        }),
      );
      return this.mapOrderResult(data as Record<string, unknown>, symbol);
    } catch {
      // 查证失败（如订单确实未创建）不吞掉超时异常
      return undefined;
    }
  }

  /**
   * 下单前精度规整与合法性校验
   *
   * - 数量向下取整到 stepSize 整数倍
   * - 价格向下取整到 tickSize 整数倍
   * - 校验名义价值不低于 minNotional
   * - 校验 clientOrderId 合法字符集
   *
   * @param params - 原始下单参数
   * @returns 规整后的下单参数
   * @throws {ExchangeError} 校验不通过时抛出
   */
  private async normalizeOrder(params: NewOrderParams): Promise<NewOrderParams> {
    const spec = await this.market.getSymbolSpec(params.symbol);

    if (!Number.isFinite(params.quantity) || params.quantity <= 0) {
      throw makeExchangeError("quantity 必须为正数");
    }
    if (params.type === "LIMIT" && (params.price === undefined || params.price <= 0)) {
      throw makeExchangeError("LIMIT 订单必须提供正数 price");
    }

    const quantity = roundQuantity(params.quantity, spec.stepSize);
    const price = params.price !== undefined ? roundPrice(params.price, spec.tickSize) : undefined;

    if (price !== undefined && !isAboveMinNotional(price, quantity, spec.minNotional)) {
      throw makeExchangeError(
        `下单名义价值（${price * quantity}）低于最小限制 ${spec.minNotional}`,
        "INVALID_PARAMS",
      );
    }

    if (
      params.newClientOrderId !== undefined &&
      !CLIENT_ORDER_ID_PATTERN.test(params.newClientOrderId)
    ) {
      throw makeExchangeError("newClientOrderId 含非法字符（允许 [.A-Z:/a-z0-9_-]，1~36 位）");
    }

    return { ...params, quantity, price };
  }

  /**
   * 撤单
   *
   * @param params - symbol + (orderId | origClientOrderId) 二选一
   * @returns 被撤销的订单
   * @throws {ExchangeError} 订单不存在或已成交时抛出
   */
  async cancelOrder(params: OrderQueryParams): Promise<OrderResult> {
    if (params.orderId === undefined && params.origClientOrderId === undefined) {
      throw makeExchangeError("cancelOrder 需提供 orderId 或 origClientOrderId");
    }
    const data = await safeCall(() =>
      this.client.restAPI.cancelOrder({
        symbol: params.symbol,
        ...(params.orderId !== undefined ? { orderId: params.orderId } : {}),
        ...(params.origClientOrderId !== undefined
          ? { origClientOrderId: params.origClientOrderId }
          : {}),
        ...this.withRecvWindow({}),
      }),
    );
    return this.mapOrderResult(data as Record<string, unknown>, params.symbol);
  }

  /**
   * 撤销某交易对全部未成交订单
   *
   * @param symbol - 交易对
   * @throws {ExchangeError} 网络异常
   */
  async cancelAllOrders(symbol: string): Promise<void> {
    await safeCall(() =>
      this.client.restAPI.cancelAllOpenOrders({
        symbol,
        ...this.withRecvWindow({}),
      }),
    );
    this.logger.info("撤销全部未成交订单", { symbol });
  }

  /**
   * 修改未成交订单
   *
   * @param params - 原订单标识 + 新数量 / 价格 / 方向
   * @returns 修改后的订单
   * @throws {ExchangeError} 参数非法或订单不可改时抛出
   */
  async modifyOrder(params: {
    symbol: string;
    side: OrderSide;
    quantity: number;
    price: number;
    orderId?: number;
    origClientOrderId?: string;
  }): Promise<OrderResult> {
    if (params.orderId === undefined && params.origClientOrderId === undefined) {
      throw makeExchangeError("modifyOrder 需提供 orderId 或 origClientOrderId");
    }
    // 依交易对精度规格规整数与价，避免超出交易所允许的小数位
    const { quantity, price } = await this.roundOrderValues(
      params.symbol,
      params.quantity,
      params.price,
    );
    const data = await safeCall(() =>
      this.client.restAPI.modifyOrder({
        symbol: params.symbol,
        // 官方 side 为字符串枚举类型（非字面量联合），需精确断言
        side: params.side as DerivativesTradingUsdsFuturesRestAPI.ModifyOrderSideEnum,
        quantity,
        price,
        ...(params.orderId !== undefined ? { orderId: params.orderId } : {}),
        ...(params.origClientOrderId !== undefined
          ? { origClientOrderId: params.origClientOrderId }
          : {}),
        ...this.withRecvWindow({}),
      }),
    );
    const result = this.mapOrderResult(data as Record<string, unknown>, params.symbol);
    result.side = (data.side ?? params.side) as OrderSide;
    result.price = Number(data.price ?? price);
    result.origQty = Number(data.origQty ?? quantity);
    return result;
  }

  // ==========================================================================
  //  订单查询
  // ==========================================================================

  /**
   * 查询单个订单
   *
   * @param params - symbol + (orderId | origClientOrderId) 二选一
   * @returns 订单详情
   * @throws {ExchangeError} 订单不存在时抛出
   */
  async getOrder(params: OrderQueryParams): Promise<OrderResult> {
    if (params.orderId === undefined && params.origClientOrderId === undefined) {
      throw makeExchangeError("getOrder 需提供 orderId 或 origClientOrderId");
    }
    const data = await safeCall(() =>
      this.client.restAPI.queryOrder({
        symbol: params.symbol,
        ...(params.orderId !== undefined ? { orderId: params.orderId } : {}),
        ...(params.origClientOrderId !== undefined
          ? { origClientOrderId: params.origClientOrderId }
          : {}),
        ...this.withRecvWindow({}),
      }),
    );
    return this.mapOrderResult(data as Record<string, unknown>, params.symbol);
  }

  /**
   * 查询当前全部未成交订单
   *
   * @param symbol - 交易对（可选）
   * @returns 未成交订单列表
   * @throws {ExchangeError} 鉴权失败或网络异常
   */
  async getOpenOrders(symbol?: string): Promise<OrderResult[]> {
    const data = await safeCall(() =>
      this.client.restAPI.currentAllOpenOrders(
        this.withRecvWindow(symbol ? { symbol } : {}),
      ),
    );
    return (Array.isArray(data) ? data : []).map((it) =>
      this.mapOrderResult(it as Record<string, unknown>, symbol ?? ""),
    );
  }

  /**
   * 查询历史订单
   *
   * @param params - 交易对 / 分页 / 时间范围
   * @returns 历史订单列表（时间倒序）
   * @throws {ExchangeError} 鉴权失败或网络异常
   */
  async getOrderHistory(params: OrderHistoryParams): Promise<OrderResult[]> {
    const data = await safeCall(() =>
      // 官方请求字段为 readonly，条件展开构造字面量以获得完整类型检查
      this.client.restAPI.allOrders({
        symbol: params.symbol,
        ...(params.orderId !== undefined ? { orderId: params.orderId } : {}),
        ...(params.startTime !== undefined ? { startTime: params.startTime } : {}),
        ...(params.endTime !== undefined ? { endTime: params.endTime } : {}),
        ...(params.limit !== undefined ? { limit: params.limit } : {}),
        ...this.withRecvWindow({}),
      }),
    );
    return (Array.isArray(data) ? data : []).map((it) =>
      this.mapOrderResult(it as Record<string, unknown>, params.symbol),
    );
  }

  /**
   * 查询强平订单
   *
   * @param params - 交易对 / 强平类型 / 条数
   * @returns 强平订单列表
   * @throws {ExchangeError} 鉴权失败或网络异常
   */
  async getForceOrders(params: ForceOrdersParams = {}): Promise<ForceOrderRecord[]> {
    const request: Record<string, unknown> = {};
    if (params.symbol) request.symbol = params.symbol;
    if (params.autoCloseType) request.autoCloseType = params.autoCloseType;
    if (params.limit !== undefined) request.limit = params.limit;
    Object.assign(request, this.withRecvWindow({}));

    const data = await safeCall(() =>
      this.client.restAPI.usersForceOrders(
        request as DerivativesTradingUsdsFuturesRestAPI.UsersForceOrdersRequest,
      ),
    );
    return (Array.isArray(data) ? data : []).map((it) => ({
      symbol: it.symbol ?? "",
      orderId: Number(it.orderId ?? 0),
      avgPrice: Number(it.avgPrice ?? 0),
      executedQty: Number(it.executedQty ?? 0),
      origQty: Number(it.origQty ?? 0),
      // 官方类型声明缺失 autoCloseType，但 API 实际返回，安全取值
      autoCloseType: (it as { autoCloseType?: string }).autoCloseType ?? "",
      positionSide: (it.positionSide ?? "BOTH") as PositionSide,
      side: (it.side ?? "BUY") as OrderSide,
      time: Number(it.time ?? 0),
    }));
  }

  /**
   * 查询成交记录
   *
   * @param params - 交易对 / 起始订单 / 条数
   * @returns 成交记录列表
   * @throws {ExchangeError} 鉴权失败或网络异常
   */
  async getTrades(params: {
    symbol: string;
    orderId?: number;
    limit?: number;
  }): Promise<TradeRecord[]> {
    const data = await safeCall(() =>
      // 官方请求字段为 readonly，条件展开构造字面量以获得完整类型检查
      this.client.restAPI.accountTradeList({
        symbol: params.symbol,
        ...(params.orderId !== undefined ? { orderId: params.orderId } : {}),
        ...(params.limit !== undefined ? { limit: params.limit } : {}),
        ...this.withRecvWindow({}),
      }),
    );
    return (Array.isArray(data) ? data : []).map((it) => ({
      symbol: it.symbol ?? params.symbol,
      id: Number(it.id ?? 0),
      orderId: Number(it.orderId ?? 0),
      price: Number(it.price ?? 0),
      qty: Number(it.qty ?? 0),
      quoteQty: Number(it.quoteQty ?? 0),
      commission: Number(it.commission ?? 0),
      commissionAsset: it.commissionAsset ?? "",
      time: Number(it.time ?? 0),
      // 官方字段名为 buyer / maker（无 is- 前缀）
      isBuyer: Boolean(it.buyer),
      isMaker: Boolean(it.maker),
      realizedPnl: Number(it.realizedPnl ?? 0),
    }));
  }

  // ==========================================================================
  //  杠杆 / 保证金 / 持仓模式
  // ==========================================================================

  /**
   * 设置交易对杠杆
   *
   * @param symbol   - 交易对
   * @param leverage - 目标杠杆倍数（1~125，视交易对而定）
   * @returns 实际生效的杠杆
   * @throws {ExchangeError} 超出交易对允许范围时被拒绝
   */
  async setLeverage(symbol: string, leverage: number): Promise<LeverageResult> {
    const data = await safeCall(() =>
      this.client.restAPI.changeInitialLeverage({
        symbol,
        leverage,
        ...this.withRecvWindow({}),
      }),
    );
    const result = {
      symbol: data.symbol ?? symbol,
      leverage: Number(data.leverage ?? leverage),
    };
    this.logger.info("设置杠杆", result);
    return result;
  }

  /**
   * 设置保证金模式
   *
   * @param symbol     - 交易对
   * @param marginType - ISOLATED（逐仓）/ CROSSED（全仓）
   * @throws {ExchangeError} 存在持仓时切换可能被拒绝
   */
  async setMarginType(symbol: string, marginType: MarginType): Promise<void> {
    await safeCall(() =>
      this.client.restAPI.changeMarginType({
        symbol,
        marginType:
          marginType as DerivativesTradingUsdsFuturesRestAPI.ChangeMarginTypeMarginTypeEnum,
        ...this.withRecvWindow({}),
      }),
    );
    this.logger.info("设置保证金模式", { symbol, marginType });
  }

  /**
   * 调整逐仓保证金
   *
   * @param params - 交易对 / 金额 / 类型 / 持仓方向
   * @returns 调整结果
   * @throws {ExchangeError} 非逐仓模式时被拒绝
   */
  async adjustPositionMargin(params: AdjustMarginParams): Promise<AdjustMarginResult> {
    const data = await safeCall(() =>
      this.client.restAPI.modifyIsolatedPositionMargin({
        symbol: params.symbol,
        amount: params.amount,
        type: params.type,
        ...(params.positionSide !== undefined
          ? { positionSide: params.positionSide }
          : {}),
        ...this.withRecvWindow({}),
      }),
    );
    return {
      amount: Number(data.amount ?? params.amount),
      type: Number(data.type ?? params.type) as 1 | 2,
    };
  }

  /**
   * 查询当前持仓模式
   *
   * @returns 是否双向持仓（Hedge）
   * @throws {ExchangeError} 鉴权失败或网络异常
   */
  async getPositionMode(): Promise<PositionMode> {
    const data = await safeCall(() =>
      this.client.restAPI.getCurrentPositionMode(
        this.withRecvWindow({}),
      ),
    );
    return { dualSidePosition: data.dualSidePosition ?? false };
  }

  /**
   * 切换持仓模式
   *
   * @param dual - true=双向（Hedge），false=单向（One-way）
   * @throws {ExchangeError} 存在持仓 / 挂单时可能被拒绝
   */
  async setPositionMode(dual: boolean): Promise<void> {
    await safeCall(() =>
      this.client.restAPI.changePositionMode({
        dualSidePosition: String(dual),
        ...this.withRecvWindow({}),
      }),
    );
    this.logger.info("切换持仓模式", { dual });
  }

  // ==========================================================================
  //  算法单（条件委托）
  // ==========================================================================

  /**
   * 创建算法单（条件委托）
   *
   * @param params - 委托参数
   * @returns 算法单结果
   * @throws {ExchangeError} 参数非法或网络异常
   */
  async placeAlgoOrder(params: NewAlgoOrderParams): Promise<AlgoOrderResult> {
    const data = await safeCall(() =>
      // 官方请求字段为 readonly 且含字符串枚举，条件展开构造字面量，枚举字段按官方类型精确断言
      this.client.restAPI.newAlgoOrder({
        algoType:
          "CONDITIONAL" as DerivativesTradingUsdsFuturesRestAPI.NewAlgoOrderAlgoTypeEnum,
        symbol: params.symbol,
        side: params.side as DerivativesTradingUsdsFuturesRestAPI.NewAlgoOrderSideEnum,
        type: params.type as DerivativesTradingUsdsFuturesRestAPI.NewAlgoOrderTypeEnum,
        ...(params.positionSide !== undefined ? { positionSide: params.positionSide } : {}),
        ...(params.quantity !== undefined ? { quantity: params.quantity } : {}),
        ...(params.price !== undefined ? { price: params.price } : {}),
        ...(params.triggerPrice !== undefined ? { triggerPrice: params.triggerPrice } : {}),
        ...(params.workingType !== undefined
          ? {
              workingType:
                params.workingType as DerivativesTradingUsdsFuturesRestAPI.NewAlgoOrderWorkingTypeEnum,
            }
          : {}),
        ...(params.callbackRate !== undefined ? { callbackRate: params.callbackRate } : {}),
        ...(params.activatePrice !== undefined ? { activatePrice: params.activatePrice } : {}),
        ...(params.timeInForce !== undefined
          ? {
              timeInForce:
                params.timeInForce as DerivativesTradingUsdsFuturesRestAPI.NewAlgoOrderTimeInForceEnum,
            }
          : {}),
        // closePosition / reduceOnly / priceProtect 官方为 'true'/'false' 字符串枚举，统一转字符串
        ...(params.closePosition !== undefined
          ? {
              closePosition: String(
                params.closePosition,
              ) as DerivativesTradingUsdsFuturesRestAPI.NewAlgoOrderClosePositionEnum,
            }
          : {}),
        ...(params.reduceOnly !== undefined
          ? {
              reduceOnly: String(
                params.reduceOnly,
              ) as DerivativesTradingUsdsFuturesRestAPI.NewAlgoOrderReduceOnlyEnum,
            }
          : {}),
        ...(params.priceProtect !== undefined
          ? {
              priceProtect: String(
                params.priceProtect,
              ) as DerivativesTradingUsdsFuturesRestAPI.NewAlgoOrderPriceProtectEnum,
            }
          : {}),
        ...(params.clientAlgoId !== undefined ? { clientAlgoId: params.clientAlgoId } : {}),
        ...this.withRecvWindow({}),
      }),
    );
    const algoResult: AlgoOrderResult = {
      algoId: Number(data.algoId ?? 0),
      clientAlgoId: String(data.clientAlgoId ?? ""),
      algoType: String(data.algoType ?? "CONDITIONAL"),
      orderType: (data.orderType ?? params.type) as AlgoOrderType,
      symbol: String(data.symbol ?? params.symbol),
      side: (data.side ?? params.side) as OrderSide,
      positionSide: (data.positionSide ?? "BOTH") as PositionSide,
      algoStatus: String(data.algoStatus ?? ""),
      quantity: Number(data.quantity ?? params.quantity ?? 0),
      price: Number(data.price ?? params.price ?? 0),
      triggerPrice: Number(data.triggerPrice ?? params.triggerPrice ?? 0),
    };
    this.logger.info("创建算法单成功", {
      symbol: algoResult.symbol,
      algoId: algoResult.algoId,
    });
    return algoResult;
  }

  /**
   * 查询当前挂出的算法单
   *
   * @param symbol - 交易对（可选）
   * @returns 算法单列表
   * @throws {ExchangeError} 鉴权失败或网络异常
   */
  async getAlgoOrders(symbol?: string): Promise<AlgoOrderInfo[]> {
    const data = await safeCall(() =>
      this.client.restAPI.currentAllAlgoOpenOrders(
        this.withRecvWindow(symbol ? { symbol } : {}),
      ),
    );
    return (Array.isArray(data) ? data : []).map((it) => ({
      algoId: Number(it.algoId ?? 0),
      clientAlgoId: String(it.clientAlgoId ?? ""),
      algoType: String(it.algoType ?? ""),
      orderType: (it.orderType ?? "") as AlgoOrderType,
      symbol: String(it.symbol ?? ""),
      side: (it.side ?? "BUY") as OrderSide,
      positionSide: (it.positionSide ?? "BOTH") as PositionSide,
      algoStatus: String(it.algoStatus ?? ""),
      quantity: Number(it.quantity ?? 0),
      price: Number(it.price ?? 0),
      triggerPrice: Number(it.triggerPrice ?? 0),
      workingType: it.workingType,
      updateTime: it.updateTime != null ? Number(it.updateTime) : null,
    }));
  }

  /**
   * 撤销算法单
   *
   * @param params - clientAlgoId 与 algoId 二选一
   * @throws {ExchangeError} 参数非法或网络异常
   */
  async cancelAlgoOrder(params: CancelAlgoOrderParams): Promise<void> {
    if (params.clientAlgoId === undefined && params.algoId === undefined) {
      throw makeExchangeError("cancelAlgoOrder 需提供 clientAlgoId 或 algoId");
    }
    await safeCall(() =>
      this.client.restAPI.cancelAlgoOrder({
        ...(params.clientAlgoId !== undefined
          ? { clientAlgoId: params.clientAlgoId }
          : {}),
        ...(params.algoId !== undefined ? { algoId: params.algoId } : {}),
        ...this.withRecvWindow({}),
      }),
    );
    this.logger.info("撤销算法单", { algoId: params.algoId, clientAlgoId: params.clientAlgoId });
  }

  // ==========================================================================
  //  内部工具
  // ==========================================================================

  /**
   * 将官方订单响应映射为业务对象
   *
   * @param data   - 官方订单响应（部分字段可能缺失）
   * @param symbol - 兜底交易对
   * @returns 业务订单对象
   */
  private mapOrderResult(data: Record<string, unknown>, symbol: string): OrderResult {
    return {
      orderId: Number(data.orderId ?? 0),
      clientOrderId: String(data.clientOrderId ?? ""),
      symbol: String(data.symbol ?? symbol),
      side: (data.side ?? "BUY") as OrderSide,
      type: (data.type ?? "LIMIT") as OrderType,
      status: (data.status ?? "NEW") as OrderStatus,
      price: Number(data.price ?? 0),
      origQty: Number(data.origQty ?? 0),
      executedQty: Number(data.executedQty ?? 0),
      avgPrice: Number(data.avgPrice ?? 0),
      reduceOnly: Boolean(data.reduceOnly),
      positionSide: data.positionSide != null ? (data.positionSide as PositionSide) : undefined,
      updateTime: data.updateTime != null ? Number(data.updateTime) : undefined,
    };
  }

  /** 生成幂等客户端订单号（密码学随机保证唯一性，字符集与长度满足币安约束） */
  private genClientOrderId(): string {
    // 时间戳 base36 前缀便于回溯，配合 crypto 随机片段避免 Math.random 碰撞
    return `mcp_${Date.now().toString(36)}_${randomUUID().replace(/-/g, "").slice(0, 10)}`;
  }

  /**
   * 依交易对精度规格规整数与价
   *
   * @param symbol   - 交易对
   * @param quantity - 原始数量
   * @param price    - 原始价格
   * @returns 规整后的数量与价格
   * @throws {ExchangeError} 交易对不存在或非 TRADING 状态时抛出
   */
  private async roundOrderValues(
    symbol: string,
    quantity: number,
    price: number,
  ): Promise<{ quantity: number; price: number }> {
    const spec = await this.market.getSymbolSpec(symbol);
    return {
      quantity: roundQuantity(quantity, spec.stepSize),
      price: roundPrice(price, spec.tickSize),
    };
  }

  /** 若配置了 recvWindow 则注入到请求参数（委托公共实现） */
  private withRecvWindow<T extends object>(params: T): T & { recvWindow?: number } {
    return withRecvWindow(params, this.recvWindow);
  }
}

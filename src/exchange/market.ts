/**
 * 币安操作模块 — 行情服务（无需签名）
 *
 * 封装官方包 Market API：
 * - 价格 / 标记价 / K 线 / 深度 / 最优报价 / 24h 统计
 * - 资金费率 / 未平仓量 / 连续合约 K 线
 * - 情绪类统计（历史 OI / 多空比 / 主动买卖量 / 大户持仓比）
 * - exchangeInfo 拉取与缓存（5 分钟），并提取交易对精度规格
 *
 * 所有方法的响应均由官方包字符串字段转换为 number 语义类型。
 *
 * @module exchange/market
 */

import type {
  DerivativesTradingUsdsFutures,
  DerivativesTradingUsdsFuturesRestAPI,
} from "@binance/derivatives-trading-usds-futures";
import {
  CONTINUOUS_KLINE_DEFAULT_LIMIT,
  EXCHANGE_INFO_TTL_MS,
  FUNDING_HISTORY_DEFAULT_LIMIT,
  KLINE_CACHE_MAX_ENTRIES,
  KLINE_CACHE_TTL_MS,
  ORDERBOOK_DEFAULT_LIMIT,
  SENTIMENT_DEFAULT_LIMIT,
} from "../constants/index.js";
import { makeExchangeError } from "./errors.js";
import { countDecimals } from "./format.js";
import { safeCall, type RestResponse } from "./request.js";
import { mapKlineRow } from "../utils/klines.js";
import type {
  BookTicker,
  ContractType,
  FundingRateHistory,
  FundingRateInfo,
  Kline,
  KlineInterval,
  KlineParams,
  LongShortRatio,
  MarkPriceData,
  OIHistData,
  OpenInterestData,
  OrderBook,
  OrderBookLevel,
  StatsPeriod,
  SymbolSpec,
  SymbolTicker,
  TakerVolume,
  Ticker24h,
  TopTraderRatio,
} from "./types.js";

/**
 * 行情服务
 *
 * 行情接口为公开接口（无需签名），不接收 recvWindow 参数。
 *
 * exchangeInfo 缓存为进程级单例（与共享客户端同生命周期），
 * 避免多连接重建 MarketService 时重复拉取高 weight 的 exchangeInformation，
 * 并以 in-flight Promise 去重并发刷新。
 */
export class MarketService {
  /**
   * @param client - 官方包客户端（由 getClient 提供）
   */
  constructor(private readonly client: DerivativesTradingUsdsFutures) {}

  /**
   * 调用 REST 接口并统一解包 `.data()`，异常归一为 {@link ExchangeError}
   *
   * 委托共享的 {@link safeCall}，与 account / trade 服务复用同一实现。
   *
   * @param fn - 返回 RestApiResponse 的调用
   * @returns 解包后的业务数据
   * @throws {ExchangeError} 网络 / 服务端异常
   */
  private call<T>(fn: () => Promise<RestResponse<T>>): Promise<T> {
    return safeCall(fn);
  }

  /**
   * 连通性测试
   *
   * @returns 服务可用标记
   * @throws {ExchangeError} 网络异常
   */
  async ping(): Promise<{ ok: true }> {
    await this.call(() => this.client.restAPI.testConnectivity());
    return { ok: true };
  }

  /**
   * 获取服务器时钟
   *
   * @returns 服务器时间 ms
   * @throws {ExchangeError} 网络异常
   */
  async getServerTime(): Promise<{ serverTime: number }> {
    const data = await this.call(() => this.client.restAPI.checkServerTime());
    return { serverTime: Number(data.serverTime ?? 0) };
  }

  /**
   * 获取单个交易对最新价
   *
   * @param symbol - 交易对，如 BTCUSDT
   * @returns 最新价行情
   * @throws {ExchangeError} symbol 非法或网络异常
   */
  async getSymbolPrice(symbol: string): Promise<SymbolTicker> {
    const data = await this.call(() => this.client.restAPI.symbolPriceTickerV2({ symbol }));
    if (Array.isArray(data)) {
      const item = data.find((it) => it.symbol === symbol);
      if (!item) {
        throw makeExchangeError(`symbolPriceTickerV2 未返回 ${symbol} 的数据`, "NOT_FOUND");
      }
      return { symbol: item.symbol ?? symbol, price: Number(item.price ?? 0) };
    }
    return { symbol: data.symbol ?? symbol, price: Number(data.price ?? 0) };
  }

  /**
   * 获取最优买卖报价
   *
   * @param symbol - 交易对（缺省返回全市场）
   * @returns 最优报价列表
   * @throws {ExchangeError} 网络异常
   */
  async getBookTicker(symbol?: string): Promise<BookTicker[]> {
    const data = await this.call(() =>
      this.client.restAPI.symbolOrderBookTicker(symbol ? { symbol } : {}),
    );
    const list = Array.isArray(data) ? data : [data];
    return list.map((it) => ({
      symbol: it.symbol ?? "",
      bidPrice: Number(it.bidPrice ?? 0),
      bidQty: Number(it.bidQty ?? 0),
      askPrice: Number(it.askPrice ?? 0),
      askQty: Number(it.askQty ?? 0),
    }));
  }

  /**
   * 获取订单簿深度
   *
   * @param symbol - 交易对
   * @param limit  - 档位数量（合法值 5/10/20/50/100/500/1000）
   * @returns 买卖盘快照
   * @throws {ExchangeError} 参数非法或网络异常
   */
  async getOrderBook(symbol: string, limit = ORDERBOOK_DEFAULT_LIMIT): Promise<OrderBook> {
    const data = await this.call(() => this.client.restAPI.orderBook({ symbol, limit }));
    const mapLevel = ([price, qty]: readonly string[]): OrderBookLevel => [
      Number(price),
      Number(qty),
    ];
    return {
      lastUpdateId: Number(data.lastUpdateId ?? 0),
      bids: (data.bids ?? []).map(mapLevel),
      asks: (data.asks ?? []).map(mapLevel),
    };
  }

  /**
   * 获取 K 线
   *
   * - 历史 K 线（未指定 startTime / endTime）走进程级短 TTL 缓存：多连接与
   *   高频指标调用可复用同 symbol+interval 的数据，显著降低重复网络请求
   * - 带时间范围的查询直接透传，不缓存（避免区间数据污染共享缓存）
   *
   * @param params - 交易对 / 周期 / 时间范围
   * @returns 归一化后的 K 线数组（时间升序）
   * @throws {ExchangeError} 参数非法或网络异常
   */
  async getKlines(params: KlineParams): Promise<Kline[]> {
    if (params.startTime === undefined && params.endTime === undefined) {
      return this.getKlinesCached(params.symbol, params.interval, params.limit);
    }
    return this.fetchKlinesAndMap(params);
  }

  /**
   * 读取 / 填充进程级 K 线缓存（含 TTL 与 in-flight 去重）
   *
   * @param symbol   - 交易对
   * @param interval - K 线周期
   * @param limit    - 请求条数（缺省返回缓存全量）
   * @returns 截至最近 limit 根的 K 线（时间升序）
   */
  private async getKlinesCached(
    symbol: string,
    interval: KlineInterval,
    limit?: number,
  ): Promise<Kline[]> {
    const key = `${symbol}:${interval}`;
    const cached = KLINE_CACHE.get(key);
    const need = limit ?? cached?.klines.length ?? 0;
    if (cached && Date.now() - cached.fetchedAt < KLINE_CACHE_TTL_MS && need <= cached.klines.length) {
      return cached.klines.slice(-need);
    }

    // 并发去重：同 key+limit 已有进行中的拉取则直接复用。
    // limit 参与去重键，避免更大 limit 的请求误复用较少数据的在途请求而拿到不足样本。
    const inflightKey = `${key}:${limit ?? "all"}`;
    const inflight = KLINE_INFLIGHT.get(inflightKey);
    if (inflight) {
      const klines = await inflight;
      writeKlineCache(key, klines);
      return klines.slice(-(limit ?? klines.length));
    }

    const fetchPromise = (async () => {
      const klines = await this.fetchKlinesAndMap({
        symbol,
        interval,
        ...(limit !== undefined ? { limit } : {}),
      });
      writeKlineCache(key, klines);
      return klines;
    })();
    KLINE_INFLIGHT.set(inflightKey, fetchPromise);
    try {
      return await fetchPromise;
    } finally {
      KLINE_INFLIGHT.delete(inflightKey);
    }
  }

  /**
   * 拉取并映射 K 线（不经过缓存）
   *
   * @param params - K 线查询参数
   * @returns 归一化后的 K 线数组
   */
  private async fetchKlinesAndMap(params: KlineParams): Promise<Kline[]> {
    const data = await this.call(() =>
      this.client.restAPI.klineCandlestickData({
        symbol: params.symbol,
        interval: params.interval as DerivativesTradingUsdsFuturesRestAPI.KlineCandlestickDataIntervalEnum,
        ...(params.startTime !== undefined ? { startTime: params.startTime } : {}),
        ...(params.endTime !== undefined ? { endTime: params.endTime } : {}),
        ...(params.limit !== undefined ? { limit: params.limit } : {}),
      }),
    );
    return data.map((row) => mapKlineRow(row));
  }

  /**
   * 获取连续合约 K 线
   *
   * @param pair         - 交易对，如 BTCUSDT
   * @param contractType - 合约类型
   * @param interval     - K 线周期
   * @param limit        - 返回条数（默认 500）
   * @returns 归一化后的 K 线数组
   * @throws {ExchangeError} 参数非法或网络异常
   */
  async getContinuousKlines(
    pair: string,
    contractType: ContractType,
    interval: KlineInterval,
    limit = CONTINUOUS_KLINE_DEFAULT_LIMIT,
  ): Promise<Kline[]> {
    const data = await this.call(() =>
      this.client.restAPI.continuousContractKlineCandlestickData({
        pair,
        contractType:
          contractType as DerivativesTradingUsdsFuturesRestAPI.ContinuousContractKlineCandlestickDataContractTypeEnum,
        interval:
          interval as DerivativesTradingUsdsFuturesRestAPI.ContinuousContractKlineCandlestickDataIntervalEnum,
        limit,
      }),
    );
    return data.map((row) => mapKlineRow(row));
  }

  /**
   * 获取 24h 滚动行情统计
   *
   * @param symbol - 交易对（缺省返回全市场，weight 高，慎用）
   * @returns 24h 行情列表
   * @throws {ExchangeError} 网络异常
   */
  async get24hrTicker(symbol?: string): Promise<Ticker24h[]> {
    const data = await this.call(() =>
      this.client.restAPI.ticker24hrPriceChangeStatistics(symbol ? { symbol } : {}),
    );
    const list = Array.isArray(data) ? data : [data];
    return list.map((it) => ({
      symbol: it.symbol ?? "",
      lastPrice: Number(it.lastPrice ?? 0),
      priceChangePercent: Number(it.priceChangePercent ?? 0),
      highPrice: Number(it.highPrice ?? 0),
      lowPrice: Number(it.lowPrice ?? 0),
      volume: Number(it.volume ?? 0),
      quoteVolume: Number(it.quoteVolume ?? 0),
      weightedAvgPrice: Number(it.weightedAvgPrice ?? 0),
      count: Number(it.count ?? 0),
      openPrice: Number(it.openPrice ?? 0),
    }));
  }

  /**
   * 获取标记价（含资金费率信息）
   *
   * @param symbol - 交易对（缺省返回全市场）
   * @returns 标记价行情列表
   * @throws {ExchangeError} 网络异常
   */
  async getMarkPrice(symbol?: string): Promise<MarkPriceData[]> {
    const data = await this.call(() =>
      this.client.restAPI.markPrice(symbol ? { symbol } : {}),
    );
    const list = Array.isArray(data) ? data : [data];
    return list.map((it) => ({
      symbol: it.symbol ?? "",
      markPrice: Number(it.markPrice ?? 0),
      fundingRate: it.lastFundingRate != null ? Number(it.lastFundingRate) : undefined,
      nextFundingTime: it.nextFundingTime != null ? Number(it.nextFundingTime) : undefined,
      indexPrice: it.indexPrice != null ? Number(it.indexPrice) : undefined,
    }));
  }

  /**
   * 获取未平仓量
   *
   * @param symbol - 交易对
   * @returns 未平仓量
   * @throws {ExchangeError} 网络异常
   */
  async getOpenInterest(symbol: string): Promise<OpenInterestData> {
    const data = await this.call(() => this.client.restAPI.openInterest({ symbol }));
    return {
      symbol: data.symbol ?? symbol,
      openInterest: Number(data.openInterest ?? 0),
      time: Number(data.time ?? 0),
    };
  }

  /**
   * 获取当前资金费率
   *
   * @returns 全市场资金费率信息列表
   * @throws {ExchangeError} 网络异常
   */
  async getFundingRateInfo(): Promise<FundingRateInfo[]> {
    const data = await this.call(() => this.client.restAPI.getFundingRateInfo());
    return (Array.isArray(data) ? data : []).map((it) => ({
      symbol: it.symbol ?? "",
      adjustedFundingRateCap:
        it.adjustedFundingRateCap != null ? Number(it.adjustedFundingRateCap) : undefined,
      adjustedFundingRateFloor:
        it.adjustedFundingRateFloor != null ? Number(it.adjustedFundingRateFloor) : undefined,
      fundingIntervalHours: Number(it.fundingIntervalHours ?? 0),
    }));
  }

  /**
   * 获取历史资金费率
   *
   * @param symbol - 交易对（可选）
   * @param limit  - 返回条数（默认 100）
   * @returns 历史资金费率列表
   * @throws {ExchangeError} 网络异常
   */
  async getFundingRateHistory(
    symbol?: string,
    limit = FUNDING_HISTORY_DEFAULT_LIMIT,
  ): Promise<FundingRateHistory[]> {
    const data = await this.call(() =>
      this.client.restAPI.getFundingRateHistory(
        symbol ? { symbol, limit } : { limit },
      ),
    );
    return (Array.isArray(data) ? data : []).map((it) => ({
      symbol: it.symbol ?? "",
      fundingRate: Number(it.fundingRate ?? 0),
      fundingTime: Number(it.fundingTime ?? 0),
      markPrice: Number(it.markPrice ?? 0),
      rateType: it.rateType,
    }));
  }

  /**
   * 获取历史 OI 统计（仅主网可用）
   *
   * @param symbol - 交易对
   * @param period - 统计周期
   * @param limit  - 返回条数（默认 30，最大 500）
   * @returns 历史 OI 列表
   * @throws {ExchangeError} 网络异常
   */
  async getOpenInterestHist(
    symbol: string,
    period: StatsPeriod,
    limit = SENTIMENT_DEFAULT_LIMIT,
  ): Promise<OIHistData[]> {
    const data = await this.call(() =>
      this.client.restAPI.openInterestStatistics({
        symbol,
        period: period as DerivativesTradingUsdsFuturesRestAPI.OpenInterestStatisticsPeriodEnum,
        limit,
      }),
    );
    return (Array.isArray(data) ? data : []).map((it) => ({
      symbol: it.symbol ?? symbol,
      sumOpenInterest: Number(it.sumOpenInterest ?? 0),
      sumOpenInterestValue: Number(it.sumOpenInterestValue ?? 0),
      timestamp: Number(it.timestamp ?? 0),
    }));
  }

  /**
   * 获取多空比（仅主网可用）
   *
   * @param symbol - 交易对
   * @param period - 统计周期
   * @param limit  - 返回条数（默认 30，最大 500）
   * @returns 多空比列表
   * @throws {ExchangeError} 网络异常
   */
  async getLongShortRatio(
    symbol: string,
    period: StatsPeriod,
    limit = SENTIMENT_DEFAULT_LIMIT,
  ): Promise<LongShortRatio[]> {
    const data = await this.call(() =>
      this.client.restAPI.longShortRatio({
        symbol,
        period: period as DerivativesTradingUsdsFuturesRestAPI.LongShortRatioPeriodEnum,
        limit,
      }),
    );
    return (Array.isArray(data) ? data : []).map((it) => ({
      symbol: it.symbol ?? symbol,
      longShortRatio: Number(it.longShortRatio ?? 0),
      longAccount: Number(it.longAccount ?? 0),
      shortAccount: Number(it.shortAccount ?? 0),
      timestamp: Number(it.timestamp ?? 0),
    }));
  }

  /**
   * 获取主动买卖量（仅主网可用）
   *
   * @param symbol - 交易对
   * @param period - 统计周期
   * @param limit  - 返回条数（默认 30，最大 500）
   * @returns 主动买卖量列表
   * @throws {ExchangeError} 网络异常
   */
  async getTakerVolume(
    symbol: string,
    period: StatsPeriod,
    limit = SENTIMENT_DEFAULT_LIMIT,
  ): Promise<TakerVolume[]> {
    const data = await this.call(() =>
      this.client.restAPI.takerBuySellVolume({
        symbol,
        period: period as DerivativesTradingUsdsFuturesRestAPI.TakerBuySellVolumePeriodEnum,
        limit,
      }),
    );
    return (Array.isArray(data) ? data : []).map((it) => ({
      symbol,
      buySellRatio: Number(it.buySellRatio ?? 0),
      buyVol: Number(it.buyVol ?? 0),
      sellVol: Number(it.sellVol ?? 0),
      timestamp: Number(it.timestamp ?? 0),
    }));
  }

  /**
   * 获取大户持仓比（仅主网可用）
   *
   * @param symbol - 交易对
   * @param period - 统计周期
   * @param limit  - 返回条数（默认 30，最大 500）
   * @returns 大户持仓比列表
   * @throws {ExchangeError} 网络异常
   */
  async getTopTraderRatio(
    symbol: string,
    period: StatsPeriod,
    limit = SENTIMENT_DEFAULT_LIMIT,
  ): Promise<TopTraderRatio[]> {
    const data = await this.call(() =>
      this.client.restAPI.topTraderLongShortRatioAccounts({
        symbol,
        period:
          period as DerivativesTradingUsdsFuturesRestAPI.TopTraderLongShortRatioAccountsPeriodEnum,
        limit,
      }),
    );
    return (Array.isArray(data) ? data : []).map((it) => ({
      symbol: it.symbol ?? symbol,
      longShortRatio: Number(it.longShortRatio ?? 0),
      longAccount: Number(it.longAccount ?? 0),
      shortAccount: Number(it.shortAccount ?? 0),
      timestamp: Number(it.timestamp ?? 0),
    }));
  }

  /**
   * 获取交易对精度规格（带 5 分钟缓存）
   *
   * 从 exchangeInfo 的过滤器提取：
   * - PRICE_FILTER.tickSize → 价格步进
   * - LOT_SIZE.stepSize → 数量步进
   * - MIN_NOTIONAL.notional → 最小名义价值
   *
   * @param symbol - 交易对
   * @returns 精度规格
   * @throws {ExchangeError} symbol 不存在或非 TRADING 状态时抛出
   */
  async getSymbolSpec(symbol: string): Promise<SymbolSpec> {
    await this.refreshExchangeInfoIfStale();

    const spec = infoCache?.symbols.get(symbol);
    if (!spec) {
      throw makeExchangeError(`symbol 不存在：${symbol}`, "NOT_FOUND");
    }
    if (spec.status !== "TRADING") {
      throw makeExchangeError(
        `symbol 非 TRADING 状态：${symbol}（当前 ${spec.status}）`,
        "INVALID_PARAMS",
      );
    }
    return spec;
  }

  /**
   * 获取全市场交易规则（带 5 分钟缓存）
   *
   * @returns 全部交易对精度规格（Map）
   * @throws {ExchangeError} 网络异常
   */
  async getSymbolSpecs(): Promise<Map<string, SymbolSpec>> {
    await this.refreshExchangeInfoIfStale();
    return new Map(infoCache?.symbols ?? []);
  }

  /**
   * 刷新 exchangeInfo 到进程级缓存（含 TTL 与并发去重）
   *
   * - 缓存未过期直接返回
   * - 已有进行中的刷新则等待其完成（in-flight 去重，避免并发重复拉取）
   * - 否则发起一次刷新并缓存结果
   *
   * @throws {ExchangeError} 网络异常
   */
  private async refreshExchangeInfoIfStale(): Promise<void> {
    if (infoCache && Date.now() - infoCache.fetchedAt < EXCHANGE_INFO_TTL_MS) {
      return;
    }
    if (infoRefreshPromise) {
      await infoRefreshPromise;
      return;
    }

    infoRefreshPromise = this.fetchAndCacheExchangeInfo();
    try {
      await infoRefreshPromise;
    } finally {
      infoRefreshPromise = null;
    }
  }

  /**
   * 拉取 exchangeInformation 并建立 symbol → 规格 索引（写入进程级缓存）
   *
   * @throws {ExchangeError} 网络异常
   */
  private async fetchAndCacheExchangeInfo(): Promise<void> {
    const data = await this.call(() => this.client.restAPI.exchangeInformation());

    type SymbolInfo = {
      symbol?: string;
      status?: string;
      filters?: {
        filterType?: string;
        tickSize?: string;
        stepSize?: string;
        notional?: string;
      }[];
    };

    const symbols = new Map<string, SymbolSpec>();
    for (const sym of (data.symbols ?? []) as SymbolInfo[]) {
      const filters = sym.filters ?? [];
      const priceFilter = filters.find((f) => f.filterType === "PRICE_FILTER");
      const lotSize = filters.find((f) => f.filterType === "LOT_SIZE");
      const minNotionalFilter = filters.find((f) => f.filterType === "MIN_NOTIONAL");

      const tickSize = Number(priceFilter?.tickSize ?? 1);
      const stepSize = Number(lotSize?.stepSize ?? 1);
      const minNotional = Number(minNotionalFilter?.notional ?? 0);

      symbols.set(sym.symbol ?? "", {
        symbol: sym.symbol ?? "",
        pricePrecision: countDecimals(tickSize),
        quantityPrecision: countDecimals(stepSize),
        tickSize,
        stepSize,
        minNotional,
        status: sym.status ?? "",
      });
    }

    infoCache = { fetchedAt: Date.now(), symbols };
  }
}

// ============================================================================
//  进程级 exchangeInfo 缓存（模块单例，供所有 MarketService 实例共享）
// ============================================================================

/** exchangeInfo 缓存内容 */
let infoCache: { fetchedAt: number; symbols: Map<string, SymbolSpec> } | null = null;
/** 进行中的 exchangeInfo 刷新（并发去重） */
let infoRefreshPromise: Promise<void> | null = null;

/** 历史 K 线缓存：key=symbol:interval，存最近一批 K 线 */
const KLINE_CACHE = new Map<string, { fetchedAt: number; klines: Kline[] }>();
/** 进行中的 K 线拉取（并发去重） */
const KLINE_INFLIGHT = new Map<string, Promise<Kline[]>>();

/**
 * 写入 K 线缓存并控制条目上限
 *
 * @param key    - symbol:interval
 * @param klines - 拉取到的 K 线
 */
function writeKlineCache(key: string, klines: Kline[]): void {
  KLINE_CACHE.set(key, { fetchedAt: Date.now(), klines });
  // 超出上限时按插入序淘汰最旧条目（Map 迭代序即插入序）
  if (KLINE_CACHE.size > KLINE_CACHE_MAX_ENTRIES) {
    const oldestKey = KLINE_CACHE.keys().next().value;
    if (oldestKey !== undefined) KLINE_CACHE.delete(oldestKey);
  }
}

/**
 * 重置进程级缓存（exchangeInfo + K 线）与进行中的刷新（仅供测试使用）
 *
 * 使下次 {@link MarketService} 重新拉取数据。
 */
export function resetMarketCache(): void {
  infoCache = null;
  infoRefreshPromise = null;
  KLINE_CACHE.clear();
  KLINE_INFLIGHT.clear();
}

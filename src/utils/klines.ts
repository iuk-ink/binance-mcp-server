/**
 * K 线数据提取辅助函数
 *
 * 供行情工具与后续指标/分析工具复用，消除重复的字段提取逻辑。
 *
 * K 线拉取由调用方注入 {@link KlinesFetcher}（通常包装 `MarketService.getKlines`），
 * 以复用其 `.data()` 解包与 ExchangeError 错误归一；本模块只负责字段提取，不触网。
 *
 * @module utils/klines
 */

import type { Kline, KlineInterval } from "../exchange/types.js";

/** K 线元组字段索引（官方 klineCandlestickData 返回扁平元组，供 MarketService 映射） */
export const KLINE_FIELD_INDEX = {
  openTime: 0,
  open: 1,
  high: 2,
  low: 3,
  close: 4,
  volume: 5,
  closeTime: 6,
  quoteVolume: 7,
  trades: 8,
  takerBuyVolume: 9,
  takerQuoteVolume: 10,
} as const;

/** K 线元组原始行（元素为 number | string） */
type KlineRow = readonly (number | string)[];

/** K 线拉取函数（由调用方注入） */
export type KlinesFetcher = (params: {
  symbol: string;
  interval: KlineInterval;
  limit: number;
}) => Promise<Kline[]>;

// ============================================================================
//  本地视图提取（无网络，供已持有 Kline[] 的调用方复用）
// ============================================================================

/**
 * 从 K 线数组提取收盘价序列
 *
 * @param klines - 业务 K 线数组
 * @returns 收盘价数字数组（按时间升序）
 */
export function toCloses(klines: readonly Kline[]): number[] {
  return klines.map((k) => k.close);
}

/**
 * 从 K 线数组提取 HLC（最高/最低/收盘）行
 *
 * @param klines - 业务 K 线数组
 * @returns { high, low, close } 对象数组
 */
export function toHlcRows(klines: readonly Kline[]): { high: number; low: number; close: number }[] {
  return klines.map((k) => ({ high: k.high, low: k.low, close: k.close }));
}

/**
 * 从 K 线数组提取 HLCV（最高/最低/收盘/成交量）行
 *
 * @param klines - 业务 K 线数组
 * @returns { high, low, close, volume } 对象数组
 */
export function toHlcvRows(
  klines: readonly Kline[],
): { high: number; low: number; close: number; volume: number }[] {
  return klines.map((k) => ({ high: k.high, low: k.low, close: k.close, volume: k.volume }));
}

/**
 * 从 K 线数组提取 OHLCV（开/高/低/收/成交量）行
 *
 * @param klines - 业务 K 线数组
 * @returns { open, high, low, close, volume } 对象数组
 */
export function toOhlcvRows(
  klines: readonly Kline[],
): { open: number; high: number; low: number; close: number; volume: number }[] {
  return klines.map((k) => ({
    open: k.open,
    high: k.high,
    low: k.low,
    close: k.close,
    volume: k.volume,
  }));
}

// ============================================================================
//  拉取 + 提取组合（直连工具专用）
// ============================================================================

/**
 * 获取 K 线并提取收盘价数组
 *
 * 用于仅需收盘价的指标（SMA / EMA / RSI / MACD / BBands 等）。
 *
 * @param fetcher  - K 线拉取函数（包装 MarketService.getKlines）
 * @param symbol   - 交易对符号，如 BTCUSDT
 * @param interval - K 线周期，如 1h
 * @param limit    - K 线数量（最大 1500）
 * @returns 收盘价数字数组（按时间升序）
 */
export async function fetchClose(
  fetcher: KlinesFetcher,
  symbol: string,
  interval: KlineInterval,
  limit: number,
): Promise<number[]> {
  return toCloses(await fetcher({ symbol, interval, limit }));
}

/**
 * 获取 K 线并提取 HLC（最高/最低/收盘）对象数组
 *
 * 用于需要 HLC 数据的指标（ATR / ADX / Stochastic / SuperTrend 等）。
 *
 * @param fetcher  - K 线拉取函数（包装 MarketService.getKlines）
 * @param symbol   - 交易对符号
 * @param interval - K 线周期
 * @param limit    - K 线数量
 * @returns { high, low, close } 对象数组
 */
export async function fetchHLC(
  fetcher: KlinesFetcher,
  symbol: string,
  interval: KlineInterval,
  limit: number,
): Promise<{ high: number; low: number; close: number }[]> {
  return toHlcRows(await fetcher({ symbol, interval, limit }));
}

/**
 * 获取 K 线并提取 HLCV（最高/最低/收盘/成交量）对象数组
 *
 * 用于需要成交量的指标（MFI / VWAP 等）。
 *
 * @param fetcher  - K 线拉取函数（包装 MarketService.getKlines）
 * @param symbol   - 交易对符号
 * @param interval - K 线周期
 * @param limit    - K 线数量
 * @returns { high, low, close, volume } 对象数组
 */
export async function fetchHLCV(
  fetcher: KlinesFetcher,
  symbol: string,
  interval: KlineInterval,
  limit: number,
): Promise<{ high: number; low: number; close: number; volume: number }[]> {
  return toHlcvRows(await fetcher({ symbol, interval, limit }));
}

/**
 * 获取 K 线并提取 OHLCV（开/高/低/收/成交量）对象数组
 *
 * 用于需要开盘价的指标（OBV 等）。
 *
 * @param fetcher  - K 线拉取函数（包装 MarketService.getKlines）
 * @param symbol   - 交易对符号
 * @param interval - K 线周期
 * @param limit    - K 线数量
 * @returns { open, high, low, close, volume } 对象数组
 */
export async function fetchOHLCV(
  fetcher: KlinesFetcher,
  symbol: string,
  interval: KlineInterval,
  limit: number,
): Promise<{ open: number; high: number; low: number; close: number; volume: number }[]> {
  return toOhlcvRows(await fetcher({ symbol, interval, limit }));
}

/**
 * 将 K 线元组原始行映射为业务 Kline 对象
 *
 * 官方 `klineCandlestickData` 返回扁平元组，字段下标由 {@link KLINE_FIELD_INDEX} 定义，
 * 本函数是唯一解释元组布局的入口（供 MarketService.mapKline 使用）。
 *
 * @param row - K 线元组原始行
 * @returns 业务 Kline 对象
 */
export function mapKlineRow(row: KlineRow): Kline {
  return {
    openTime: Number(row[KLINE_FIELD_INDEX.openTime] ?? 0),
    open: Number(row[KLINE_FIELD_INDEX.open] ?? 0),
    high: Number(row[KLINE_FIELD_INDEX.high] ?? 0),
    low: Number(row[KLINE_FIELD_INDEX.low] ?? 0),
    close: Number(row[KLINE_FIELD_INDEX.close] ?? 0),
    volume: Number(row[KLINE_FIELD_INDEX.volume] ?? 0),
    closeTime: Number(row[KLINE_FIELD_INDEX.closeTime] ?? 0),
    quoteVolume: Number(row[KLINE_FIELD_INDEX.quoteVolume] ?? 0),
    trades: Number(row[KLINE_FIELD_INDEX.trades] ?? 0),
    takerBuyVolume: Number(row[KLINE_FIELD_INDEX.takerBuyVolume] ?? 0),
    takerQuoteVolume: Number(row[KLINE_FIELD_INDEX.takerQuoteVolume] ?? 0),
  };
}

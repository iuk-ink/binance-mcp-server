/**
 * Binance MCP Server — 技术指标 Zod Schema 定义
 *
 * @module domain/indicators/schemas
 * @description
 * 定义所有技术指标和工具函数的输入参数 Zod Schema。
 * Schema 分类：趋势(12) / 动量(11) / 波动率(5) / 工具函数(9) / 组合信号(4) / 风险绩效(5)。
 *
 * 共享类型说明：
 * - Interval = z.number().min(2)   — 计算周期，最少 2（少于 2 的周期无意义）
 * - PriceArr = z.array(z.number()).min(1) — 价格数组，最少 1 个值（Zod 校验用，实际指标需要更多）
 * - HLC / OHLCV           — 各指标按需选择对应 K 线格式
 */

import { z } from 'zod';

/** 计算周期，最小 2（周期 1 等同于不计算） */
const Interval = z.number().min(2).describe('计算周期');
/** 价格数组，最小 1 个值。注意：实际指标通常需要 ≥ interval+1 个数据点才有效 */
const PriceArr = z.array(z.number()).min(1).describe('价格数组');
/** 平滑类型可选值（不同指标的默认值不同，如 DMA/ADX 默认 EMA，ABANDS 默认 SMA） */
const Smooth = z.enum(['EMA', 'RMA', 'SMA', 'WMA', 'WSMA']).optional().describe('平滑类型');

const HighLow = z.array(z.object({ high: z.number(), low: z.number() })).min(1).describe('最高价/最低价数组');
const HLC = z.array(z.object({ high: z.number(), low: z.number(), close: z.number() })).min(1).describe('HLC 数组');
const OHLCV = z.array(z.object({ open: z.number(), high: z.number(), low: z.number(), close: z.number(), volume: z.number() })).min(1).describe('OHLCV 数组');

// ==================== 趋势类 (12) ====================
export const SMAInput = z.object({ values: PriceArr, interval: Interval });
export const EMAInput = z.object({ values: PriceArr, interval: Interval });
export const DEMAInput = z.object({ values: PriceArr, interval: Interval });
export const RMAInput = z.object({ values: PriceArr, interval: Interval });
export const WMAInput = z.object({ values: PriceArr, interval: Interval });
export const WSMAInput = z.object({ values: PriceArr, interval: Interval });
export const DMAInput = z.object({ values: PriceArr, short: Interval, long: Interval, smoothingType: Smooth });
export const PSARInput = z.object({ candles: HighLow, accelerationStep: z.number().min(0.001).default(0.02).describe('加速步长'), accelerationMax: z.number().min(0.01).default(0.2).describe('最大加速因子') });
export const DXInput = z.object({ candles: HLC, interval: Interval, smoothingType: Smooth });
export const ADXInput = z.object({ candles: HLC, interval: Interval, smoothingType: Smooth });
export const LinRegInput = z.object({ values: PriceArr, interval: Interval });
export const VWAPInput = z.object({ candles: OHLCV });

// ==================== 动量类 (11) ====================
export const AOInput = z.object({ candles: HighLow, shortInterval: z.number().default(5).describe('短期'), longInterval: z.number().default(34).describe('长期'), smoothingType: Smooth });
export const MOMInput = z.object({ values: PriceArr, interval: Interval });
export const CCIInput = z.object({ candles: HLC, interval: Interval });
export const MACDInput = z.object({ values: PriceArr, fast: z.number().default(12).describe('快线'), slow: z.number().default(26).describe('慢线'), signal: z.number().default(9).describe('信号线'), indicatorType: Smooth });
export const OBVInput = z.object({ candles: OHLCV, interval: Interval });
export const ROCInput = z.object({ values: PriceArr, interval: Interval });
export const StochInput = z.object({ candles: HLC, n: z.number().default(14).describe('%K周期'), m: z.number().default(3).describe('%K平滑'), p: z.number().default(3).describe('%D平滑') });
export const StochRSIInput = z.object({ values: PriceArr, interval: Interval });
export const TDSInput = z.object({ values: PriceArr });
export const RSIInput = z.object({ values: PriceArr, interval: Interval });
export const WilliamsRInput = z.object({ candles: HLC, interval: Interval });

// ==================== 波动率类 (5) ====================
export const ABandsInput = z.object({ candles: HLC, interval: Interval, width: z.number().default(4).describe('带宽系数'), smoothingType: Smooth });
export const ATRInput = z.object({ candles: HLC, interval: Interval, smoothingType: Smooth });
export const BBandsInput = z.object({ values: PriceArr, interval: Interval, deviationMultiplier: z.number().default(2).describe('标准差倍数') });
export const IQRInput = z.object({ values: PriceArr, interval: Interval });
// MADInput and TRInput removed — use util_stddev or indicator_atr instead
export const ZigZagInput = z.object({ candles: HighLow, deviation: z.number().min(0.1).default(5).describe('最小转折幅度(%)') });

// ==================== 工具函数 (9) ====================
export const AverageInput = z.object({ values: PriceArr });
export const GridInput = z.object({ lower: z.number().describe('下限'), upper: z.number().describe('上限'), levels: z.number().min(2).describe('层数'), spacing: z.enum(['arithmetic', 'geometric']).describe('间距类型'), tickSize: z.number().optional().describe('最小精度') });
export const MaxInput = z.object({ values: PriceArr });
export const MedianInput = z.object({ values: PriceArr });
export const MinInput = z.object({ values: PriceArr });
export const QuartileInput = z.object({ values: PriceArr, q: z.union([z.literal(0.25), z.literal(0.5), z.literal(0.75)]).describe('四分位点') });
export const StdDevInput = z.object({ values: PriceArr, average: z.number().optional().describe('预计算均值') });
export const StreaksInput = z.object({ prices: PriceArr, keepSide: z.enum(['up', 'down']).describe('方向') });
export const WeekdayInput = z.object({ timezone: z.string().default('UTC').describe('时区'), date: z.string().optional().describe('ISO日期') });

// ==================== 组合信号 (4) ====================
export const SignalEmaCrossInput = z.object({
  values: PriceArr,
  fast: z.number().default(12).describe('快线周期'),
  slow: z.number().default(26).describe('慢线周期'),
});
export const SignalMacdRsiInput = z.object({
  values: PriceArr,
  fast: z.number().default(12).describe('MACD 快线'),
  slow: z.number().default(26).describe('MACD 慢线'),
  signal: z.number().default(9).describe('MACD 信号线'),
  rsiInterval: z.number().default(14).describe('RSI 周期'),
});
export const SignalBbRsiInput = z.object({
  values: PriceArr,
  interval: z.number().default(20).describe('布林带周期'),
  deviationMultiplier: z.number().default(2).describe('标准差倍数'),
  rsiInterval: z.number().default(14).describe('RSI 周期'),
});
export const SignalMACrossInput = z.object({
  values: PriceArr,
  short: z.number().default(5).describe('短期均线周期'),
  long: z.number().default(20).describe('长期均线周期'),
});

// ==================== 风险/绩效 (5) ====================
const ReturnArr = z.array(z.number()).min(2).describe('收益率数组（如日收益率序列）');
const PriceSeries = z.array(z.number()).min(2).describe('净值/价格序列');
export const SharpeInput = z.object({ returns: ReturnArr, riskFreeRate: z.number().default(0).describe('无风险利率（如 0.02 表示 2%）') });
export const MaxDrawdownInput = z.object({ equity: PriceSeries });
export const CalmarInput = z.object({ returns: ReturnArr, equity: PriceSeries, riskFreeRate: z.number().default(0).describe('无风险利率') });
export const WinRateInput = z.object({ trades: z.array(z.object({ result: z.enum(['WIN', 'LOSS']), pnl: z.number() })).min(1).describe('交易记录：{result:"WIN"|"LOSS", pnl:盈亏金额}') });
export const VaRInput = z.object({ returns: ReturnArr, confidence: z.number().default(0.95).describe('置信度（0.95 表示 95%）') });

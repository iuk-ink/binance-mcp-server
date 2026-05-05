/**
 * Binance MCP Server v2.0 — 技术指标 Zod Schema 定义
 *
 * @module domain/indicators/schemas
 * @description 定义所有技术指标和工具函数的输入参数 Zod Schema。
 */

import { z } from 'zod';

/** 计算周期，最小 2 */
const Interval = z.number().min(2).describe('计算周期');
/** 平滑类型可选值（不同指标的默认值不同，如 DMA/ADX 默认 EMA，ABANDS 默认 SMA） */
const Smooth = z.enum(['EMA', 'RMA', 'SMA', 'WMA', 'WSMA']).optional().describe('平滑类型');

const PriceArr = z.array(z.number()).min(1).describe('价格数组');
const HighLow = z.array(z.object({ high: z.number(), low: z.number() })).min(1).describe('最高价/最低价数组');
const HLC = z.array(z.object({ high: z.number(), low: z.number(), close: z.number() })).min(1).describe('HLC 数组');
const OHLCV = z.array(z.object({ open: z.number(), high: z.number(), low: z.number(), close: z.number(), volume: z.number() })).min(1).describe('OHLCV 数组');

// ==================== 趋势类 (13) ====================
export const SMAInput = z.object({ values: PriceArr, interval: Interval });
export const EMAInput = z.object({ values: PriceArr, interval: Interval });
export const DEMAInput = z.object({ values: PriceArr, interval: Interval });
export const RMAInput = z.object({ values: PriceArr, interval: Interval });
export const WMAInput = z.object({ values: PriceArr, interval: Interval });
export const WSMAInput = z.object({ values: PriceArr, interval: Interval });
export const SMA15Input = z.object({ values: PriceArr });
export const DMAInput = z.object({ values: PriceArr, short: Interval, long: Interval, smoothingType: Smooth });
export const PSARInput = z.object({ candles: HighLow, accelerationStep: z.number().min(0.001).default(0.02).describe('加速步长'), accelerationMax: z.number().min(0.01).default(0.2).describe('最大加速因子') });
export const DXInput = z.object({ candles: HLC, interval: Interval, smoothingType: Smooth });
export const ADXInput = z.object({ candles: HLC, interval: Interval, smoothingType: Smooth });
export const LinRegInput = z.object({ values: PriceArr, interval: Interval });
export const VWAPInput = z.object({ candles: OHLCV });

// ==================== 动量类 (14) ====================
export const AOInput = z.object({ candles: HighLow, shortInterval: z.number().default(5).describe('短期'), longInterval: z.number().default(34).describe('长期'), smoothingType: Smooth });
export const ACInput = z.object({ candles: HighLow, shortAO: z.number().default(5), longAO: z.number().default(34), signalInterval: z.number().default(5) });
export const MOMInput = z.object({ values: PriceArr, interval: Interval });
export const CCIInput = z.object({ candles: HLC, interval: Interval });
export const CGInput = z.object({ values: PriceArr, interval: Interval, signalInterval: z.number().default(3).describe('信号线周期') });
export const MACDInput = z.object({ values: PriceArr, fast: z.number().default(12).describe('快线'), slow: z.number().default(26).describe('慢线'), signal: z.number().default(9).describe('信号线'), indicatorType: Smooth });
export const OBVInput = z.object({ candles: OHLCV, interval: Interval });
export const REIInput = z.object({ candles: HLC, interval: Interval });
export const ROCInput = z.object({ values: PriceArr, interval: Interval });
export const StochInput = z.object({ candles: HLC, n: z.number().default(14).describe('%K周期'), m: z.number().default(3).describe('%K平滑'), p: z.number().default(3).describe('%D平滑') });
export const StochRSIInput = z.object({ values: PriceArr, interval: Interval });
export const TDSInput = z.object({ values: PriceArr });
export const RSIInput = z.object({ values: PriceArr, interval: Interval });
export const WilliamsRInput = z.object({ candles: HLC, interval: Interval });

// ==================== 波动率类 (8) ====================
export const ABandsInput = z.object({ candles: HLC, interval: Interval, width: z.number().default(4).describe('带宽系数'), smoothingType: Smooth });
export const ATRInput = z.object({ candles: HLC, interval: Interval, smoothingType: Smooth });
export const BBandsInput = z.object({ values: PriceArr, interval: Interval, deviationMultiplier: z.number().default(2).describe('标准差倍数') });
export const BBWInput = z.object({ values: PriceArr, interval: Interval, deviationMultiplier: z.number().default(2) });
export const IQRInput = z.object({ values: PriceArr, interval: Interval });
export const MADInput = z.object({ values: PriceArr, interval: Interval });
export const TRInput = z.object({ candles: HLC });
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

/**
 * Binance MCP Server — 通用工具函数 (9 个)
 *
 * @module domain/indicators/utility
 * @description
 * 提供与交易相关的通用计算工具，均为纯函数，无外部 API 依赖。
 */

import { getAverage, getGrid, getMaximum, getMedian, getMinimum, getQuartile, getStandardDeviation, getStreaks, isMonday, isTuesday, isWednesday, isThursday, isFriday, isSaturday, isSunday } from 'trading-signals';
import type { ToolDefinition } from '../../types/common.js';
import { wrapHandler } from '../../utils/response.js';
import { AverageInput, GridInput, MaxInput, MedianInput, MinInput, QuartileInput, StdDevInput, StreaksInput, WeekdayInput } from './schemas.js';

export const utilityTools: ToolDefinition[] = [
  { name: 'util_average', description: '计算数组的算术平均值', schema: AverageInput, handler: wrapHandler((args: { values: number[] }) => { return { function: 'average', result: getAverage(args.values) }; }, 'util_average') },
  {
    name: 'util_grid', description: '计算网格交易层级', schema: GridInput,
    handler: wrapHandler((args: { lower: number; upper: number; levels: number; spacing: 'arithmetic' | 'geometric'; tickSize?: number }) => { const r = getGrid({ lower: args.lower, upper: args.upper, levels: args.levels, spacing: args.spacing, tickSize: args.tickSize }); return { function: 'grid', lower: args.lower, upper: args.upper, levels: args.levels, spacing: args.spacing, levels_count: r.length, result: r }; }, 'util_grid'),
  },
  { name: 'util_max', description: '计算数组的最大值', schema: MaxInput, handler: wrapHandler((args: { values: number[] }) => { return { function: 'max', result: getMaximum(args.values) }; }, 'util_max') },
  { name: 'util_min', description: '计算数组的最小值', schema: MinInput, handler: wrapHandler((args: { values: number[] }) => { return { function: 'min', result: getMinimum(args.values) }; }, 'util_min') },
  { name: 'util_median', description: '计算数组的中位数', schema: MedianInput, handler: wrapHandler((args: { values: number[] }) => { return { function: 'median', result: getMedian(args.values) }; }, 'util_median') },
  {
    name: 'util_quartile', description: '计算数组的四分位数', schema: QuartileInput,
    handler: wrapHandler((args: { values: number[]; q: 0.25 | 0.5 | 0.75 }) => { return { function: 'quartile', q: args.q, result: getQuartile(args.values, args.q) }; }, 'util_quartile'),
  },
  {
    name: 'util_stddev', description: '计算数组的标准差', schema: StdDevInput,
    handler: wrapHandler((args: { values: number[]; average?: number }) => { return { function: 'stddev', result: getStandardDeviation(args.values, args.average) }; }, 'util_stddev'),
  },
  {
    name: 'util_streaks', description: '计算连续涨跌', schema: StreaksInput,
    handler: wrapHandler((args: { prices: number[]; keepSide: 'up' | 'down' }) => { return { function: 'streaks', keepSide: args.keepSide, result: getStreaks(args.prices, args.keepSide) }; }, 'util_streaks'),
  },
  {
    name: 'util_weekday', description: '判断星期几（时区感知）', schema: WeekdayInput,
    handler: wrapHandler((args: { timezone: string; date?: string }) => {
      const d = args.date ? new Date(args.date) : undefined;
      const bools: Record<string, boolean> = {
        isMonday: isMonday(args.timezone, d), isTuesday: isTuesday(args.timezone, d),
        isWednesday: isWednesday(args.timezone, d), isThursday: isThursday(args.timezone, d),
        isFriday: isFriday(args.timezone, d), isSaturday: isSaturday(args.timezone, d),
        isSunday: isSunday(args.timezone, d),
      };
      const weekday = Object.keys(bools).find((k) => bools[k])?.replace('is', '') ?? null;
      return { function: 'weekday', timezone: args.timezone, date: args.date || 'today', weekday, ...bools };
    }, 'util_weekday'),
  },
];

/**
 * Binance MCP Server — 通用工具函数 (9 个)
 *
 * @module domain/indicators/utility
 * @description
 * 提供与交易相关的通用计算工具，均为纯函数，无外部 API 依赖。
 */
import { getAverage, getGrid, getMaximum, getMedian, getMinimum, getQuartile, getStandardDeviation, getStreaks, isMonday, isTuesday, isWednesday, isThursday, isFriday, isSaturday, isSunday } from 'trading-signals';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { logError } from '../../utils/error-handling.js';
import type { ToolDefinition } from '../../types/common.js';
import { AverageInput, GridInput, MaxInput, MedianInput, MinInput, QuartileInput, StdDevInput, StreaksInput, WeekdayInput } from './schemas.js';

function ok(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

export const utilityTools: ToolDefinition[] = [
  { name: 'util_average', description: '计算数组的算术平均值', schema: AverageInput, handler: async (a: unknown) => { const { values } = a as { values: number[] }; try { return ok({ function: 'average', result: getAverage(values) }); } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); } } },
  {
    name: 'util_grid', description: '计算网格交易层级', schema: GridInput,
    handler: async (a: unknown) => { const { lower, upper, levels, spacing, tickSize } = a as { lower: number; upper: number; levels: number; spacing: 'arithmetic' | 'geometric'; tickSize?: number }; try { const r = getGrid({ lower, upper, levels, spacing, tickSize }); return ok({ function: 'grid', lower, upper, levels, spacing, levels_count: r.length, result: r }); } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); } }
  },
  { name: 'util_max', description: '计算数组的最大值', schema: MaxInput, handler: async (a: unknown) => { const { values } = a as { values: number[] }; try { return ok({ function: 'max', result: getMaximum(values) }); } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); } } },
  { name: 'util_min', description: '计算数组的最小值', schema: MinInput, handler: async (a: unknown) => { const { values } = a as { values: number[] }; try { return ok({ function: 'min', result: getMinimum(values) }); } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); } } },
  { name: 'util_median', description: '计算数组的中位数', schema: MedianInput, handler: async (a: unknown) => { const { values } = a as { values: number[] }; try { return ok({ function: 'median', result: getMedian(values) }); } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); } } },
  {
    name: 'util_quartile', description: '计算数组的四分位数', schema: QuartileInput,
    handler: async (a: unknown) => { const { values, q } = a as { values: number[]; q: 0.25 | 0.5 | 0.75 }; try { return ok({ function: 'quartile', q, result: getQuartile(values, q) }); } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); } }
  },
  {
    name: 'util_stddev', description: '计算数组的标准差', schema: StdDevInput,
    handler: async (a: unknown) => { const { values, average } = a as { values: number[]; average?: number }; try { return ok({ function: 'stddev', result: getStandardDeviation(values, average) }); } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); } }
  },
  {
    name: 'util_streaks', description: '计算连续涨跌', schema: StreaksInput,
    handler: async (a: unknown) => { const { prices, keepSide } = a as { prices: number[]; keepSide: 'up' | 'down' }; try { return ok({ function: 'streaks', keepSide, result: getStreaks(prices, keepSide) }); } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); } }
  },
  {
    name: 'util_weekday', description: '判断星期几（时区感知）', schema: WeekdayInput,
    handler: async (a: unknown) => {
      const { timezone, date } = a as { timezone: string; date?: string };
      try {
        const d = date ? new Date(date) : undefined;
        const bools: Record<string, boolean> = {
          isMonday: isMonday(timezone, d), isTuesday: isTuesday(timezone, d),
          isWednesday: isWednesday(timezone, d), isThursday: isThursday(timezone, d),
          isFriday: isFriday(timezone, d), isSaturday: isSaturday(timezone, d),
          isSunday: isSunday(timezone, d),
        };
        // 从布尔值推导星期几字符串。
        // 'isWednesday' → replace('is', '') → 'Wednesday'
        const weekday = Object.keys(bools).find((k) => bools[k])?.replace('is', '') ?? null;
        return ok({ function: 'weekday', timezone, date: date || 'today', weekday, ...bools });
      } catch (e) { logError(e as Error); return ok({ error: true, message: (e as Error).message }); }
    },
  },
];

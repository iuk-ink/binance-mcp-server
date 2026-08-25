/**
 * 工具层单元测试 — stderr 结构化日志
 *
 * 通过注入内存流断言输出行为，不直接断言 stderr（避免与测试运行器输出混流）。
 *
 * @module utils/__tests__/logger
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { createLogger, type Logger } from "../logger.js";

/** 创建采集型 logger：输出收集到 lines，flush 等待流写入完成 */
function captureLogger(name: string, level?: "debug" | "info" | "warn" | "error"): {
  logger: Logger;
  lines: string[];
  flush: () => Promise<void>;
} {
  const stream = new PassThrough();
  const lines: string[] = [];
  stream.on("data", (chunk: Buffer) => {
    for (const line of chunk.toString("utf-8").split("\n")) {
      if (line !== "") lines.push(line);
    }
  });
  return {
    logger: createLogger({ name, ...(level !== undefined ? { level } : {}) , stream }),
    lines,
    flush: async () => {
      await new Promise((resolve) => setImmediate(resolve));
    },
  };
}

describe("级别过滤与行格式", () => {
  test("低于配置级别的日志被过滤", async () => {
    const { logger, lines, flush } = captureLogger("t", "warn");
    logger.info("应被过滤");
    logger.warn("应输出");
    await flush();
    assert.equal(lines.length, 1);
    assert.ok(lines[0].includes("应输出"));
  });

  test("行包含时间戳 / 级别 / 模块名前缀", async () => {
    const { logger, lines, flush } = captureLogger("mymod");
    logger.info("消息");
    await flush();
    assert.match(lines[0], /^\[\d{4}-\d{2}-\d{2}T/);
    assert.ok(lines[0].includes("[INFO] [mymod]"));
  });
});

describe("meta 序列化", () => {
  test("bigint 安全转换为 number", async () => {
    const { logger, lines, flush } = captureLogger("t");
    logger.info("大整数", { big: 10n });
    await flush();
    assert.ok(lines[0].includes('"big":10'));
  });

  test("error() 传 Error 时输出 message 与 stack", async () => {
    const { logger, lines, flush } = captureLogger("t");
    const err = new Error("订单失败");
    logger.error("下单异常", err);
    await flush();
    assert.ok(lines[0].includes("下单异常"));
    assert.ok(lines[0].includes("订单失败"));
    assert.ok(lines[0].includes("stack"));
  });

  test("空 meta 不产生尾随空格", async () => {
    const { logger, lines, flush } = captureLogger("t");
    logger.info("纯消息");
    await flush();
    assert.ok(lines[0].endsWith("纯消息"), `行尾不应有空白：${JSON.stringify(lines[0])}`);
  });

  test("嵌套对象与 Date 序列化为 JSON（bigint 安全）", async () => {
    const { logger, lines, flush } = captureLogger("t");
    const date = new Date("2026-01-01T00:00:00.000Z");
    logger.info("嵌套", { nested: { a: 1 }, when: date, big: 10n });
    await flush();
    assert.ok(lines[0].includes('"nested":{"a":1}'), "嵌套对象应内联序列化");
    assert.ok(lines[0].includes('"when":"2026-01-01T00:00:00.000Z"'), "Date 应转 ISO 字符串");
    assert.ok(lines[0].includes('"big":10'), "bigint 应安全转 number");
  });

  test("undefined 字段被 JSON 省略而非报错", async () => {
    const { logger, lines, flush } = captureLogger("t");
    logger.info("跳过 undefined", { keep: 1, drop: undefined });
    await flush();
    assert.ok(lines[0].includes('"keep":1'), "保留字段应输出");
    assert.ok(!lines[0].includes("drop"), "undefined 字段不应输出");
  });

  test("循环引用触发序列化失败兜底", async () => {
    const { logger, lines, flush } = captureLogger("t");
    const circular: Record<string, unknown> = { name: "circ" };
    circular.self = circular;
    logger.info("循环引用", circular);
    await flush();
    assert.ok(lines[0].includes("[meta 序列化失败]"), "循环引用应走兜底而非崩溃");
    assert.ok(lines[0].includes("循环引用"), "消息本体仍应输出");
  });
});

describe("child 记录器", () => {
  test("拼接组件名并继承合并上下文 meta", async () => {
    const { logger, lines, flush } = captureLogger("exchange");
    const child = logger.child({ component: "market", roundId: 3 });
    child.info("拉取行情", { symbol: "BTCUSDT" });
    await flush();
    assert.ok(lines[0].includes("[INFO] [exchange.market]"));
    assert.ok(lines[0].includes('"roundId":3'));
    assert.ok(lines[0].includes('"symbol":"BTCUSDT"'));
  });
});

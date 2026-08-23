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

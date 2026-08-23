/**
 * 币安操作层单元测试 — 交易服务
 *
 * 使用伪造客户端 + 伪造行情服务验证下单规整、幂等与错误处理（不触网）。
 *
 * @module exchange/__tests__/trade
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  BINANCE_ERROR_CODE_BACKEND_TIMEOUT,
  CLIENT_ORDER_ID_MAX_LENGTH,
} from "../../constants/index.js";
import { TradeService } from "../trade.js";
import type { MarketService } from "../market.js";
import { createFakeClient } from "./fake-client.js";

/** 伪造行情服务：返回固定精度规格 */
function fakeMarket(): MarketService {
  return {
    getSymbolSpec: async () => ({
      symbol: "BTCUSDT",
      pricePrecision: 2,
      quantityPrecision: 3,
      tickSize: 0.01,
      stepSize: 0.001,
      minNotional: 100,
      status: "TRADING",
    }),
  } as unknown as MarketService;
}

describe("TradeService 下单", () => {
  test("dry-run 仅校验不提交", async () => {
    const client = createFakeClient({});
    const trade = new TradeService(client, fakeMarket());
    const result = await trade.placeOrder({
      symbol: "BTCUSDT",
      side: "BUY",
      type: "LIMIT",
      quantity: 1.2345,
      price: 50000.123,
      dryRun: true,
    });
    assert.equal(result.status, "DRY_RUN");
    assert.equal(result.origQty, 1.234, "数量应规整到 stepSize");
    assert.equal(result.price, 50000.12, "价格应规整到 tickSize");
  });

  test("下单前精度规整并提交", async () => {
    const client = createFakeClient({
      newOrder: {
        orderId: 1,
        clientOrderId: "mcp_test",
        symbol: "BTCUSDT",
        side: "BUY",
        type: "LIMIT",
        status: "NEW",
        price: "50000.12",
        origQty: "1.234",
        executedQty: "0",
        avgPrice: "0",
        reduceOnly: "false",
      },
    });
    const trade = new TradeService(client, fakeMarket());
    const result = await trade.placeOrder({
      symbol: "BTCUSDT",
      side: "BUY",
      type: "LIMIT",
      quantity: 1.2345,
      price: 50000.123,
    });
    assert.equal(result.orderId, 1);
    assert.equal(result.price, 50000.12);
    assert.equal(result.origQty, 1.234);
  });

  test("名义价值低于 minNotional 被拦截", async () => {
    const client = createFakeClient({});
    const trade = new TradeService(client, fakeMarket());
    await assert.rejects(
      () =>
        trade.placeOrder({
          symbol: "BTCUSDT",
          side: "BUY",
          type: "LIMIT",
          quantity: 0.001,
          price: 1,
        }),
      /低于最小限制/,
    );
  });

  test("-1007 超时后用幂等 clientOrderId 查证", async () => {
    const timeoutErr = new Error("Send status unknown") as Error & { code?: number };
    timeoutErr.code = BINANCE_ERROR_CODE_BACKEND_TIMEOUT;
    let newOrderCalled = 0;
    const client = createFakeClient({
      newOrder: () => {
        newOrderCalled += 1;
        throw timeoutErr;
      },
      queryOrder: {
        orderId: 99,
        clientOrderId: "mcp_recovered",
        symbol: "BTCUSDT",
        side: "BUY",
        type: "LIMIT",
        status: "FILLED",
        price: "50000",
        origQty: "1",
        executedQty: "1",
        avgPrice: "50000",
        reduceOnly: "false",
      },
    });
    const trade = new TradeService(client, fakeMarket());
    const result = await trade.placeOrder({
      symbol: "BTCUSDT",
      side: "BUY",
      type: "LIMIT",
      quantity: 1,
      price: 50000,
    });
    assert.equal(newOrderCalled, 1);
    assert.equal(result.status, "FILLED", "应通过查证恢复已成交订单");
    assert.equal(result.orderId, 99);
  });

  test("-1007 超时但查证不到订单时上抛超时异常", async () => {
    const timeoutErr = new Error(
      "Timeout waiting for response from backend server.",
    ) as Error & { code?: number };
    timeoutErr.code = BINANCE_ERROR_CODE_BACKEND_TIMEOUT;
    const notFoundErr = new Error("Order does not exist.") as Error & { code?: number };
    notFoundErr.code = -2013;
    const client = createFakeClient({
      newOrder: () => {
        throw timeoutErr;
      },
      queryOrder: () => {
        throw notFoundErr;
      },
    });
    const trade = new TradeService(client, fakeMarket());
    await assert.rejects(
      () =>
        trade.placeOrder({
          symbol: "BTCUSDT",
          side: "BUY",
          type: "LIMIT",
          quantity: 1,
          price: 50000,
          newClientOrderId: "recover-id",
        }),
      (err: Error) =>
        (err as { code?: number }).code === BINANCE_ERROR_CODE_BACKEND_TIMEOUT,
    );
  });

  test("自动生成的幂等号满足币安约束", async () => {
    let capturedClientOrderId = "";
    const client = createFakeClient({
      newOrder: (args: Record<string, unknown>) => {
        capturedClientOrderId = args.newClientOrderId as string;
        return {
          data: async () => ({
            orderId: 1,
            clientOrderId: capturedClientOrderId,
            symbol: "BTCUSDT",
            side: "BUY",
            type: "LIMIT",
            status: "NEW",
            price: "50000",
            origQty: "1",
            executedQty: "0",
            avgPrice: "0",
            reduceOnly: "false",
          }),
        };
      },
    });
    const trade = new TradeService(client, fakeMarket());
    await trade.placeOrder({
      symbol: "BTCUSDT",
      side: "BUY",
      type: "LIMIT",
      quantity: 1,
      price: 50000,
    });

    assert.ok(capturedClientOrderId.length > 0, "未传自定义订单号时应自动生成");
    assert.ok(
      capturedClientOrderId.length <= CLIENT_ORDER_ID_MAX_LENGTH,
      `幂等号长度 ${capturedClientOrderId.length} 超出上限 ${CLIENT_ORDER_ID_MAX_LENGTH}`,
    );
    assert.ok(capturedClientOrderId.startsWith("mcp_"));
    assert.match(capturedClientOrderId, /^[.A-Z:/a-z0-9_-]{1,36}$/);
  });
});

describe("TradeService 订单查询", () => {
  test("getOrder 映射订单详情", async () => {
    const client = createFakeClient({
      queryOrder: {
        orderId: 1,
        clientOrderId: "c1",
        symbol: "BTCUSDT",
        side: "BUY",
        type: "LIMIT",
        status: "NEW",
        price: "50000",
        origQty: "1",
        executedQty: "0",
        avgPrice: "0",
        reduceOnly: "false",
      },
    });
    const trade = new TradeService(client, fakeMarket());
    const result = await trade.getOrder({ symbol: "BTCUSDT", orderId: 1 });
    assert.equal(result.orderId, 1);
    assert.equal(result.status, "NEW");
  });

  test("getOrder 缺标识抛错", async () => {
    const trade = new TradeService(createFakeClient({}), fakeMarket());
    await assert.rejects(() => trade.getOrder({ symbol: "BTCUSDT" }), /orderId 或 origClientOrderId/);
  });
});

describe("TradeService 改单", () => {
  test("modifyOrder 依精度规格规整数量与价格后提交", async () => {
    let captured: Record<string, unknown> = {};
    const client = createFakeClient({
      modifyOrder: (params: Record<string, unknown>) => {
        captured = params;
        return {
          data: async () => ({
            orderId: 5,
            clientOrderId: "c5",
            symbol: "BTCUSDT",
            side: "BUY",
            type: "LIMIT",
            status: "NEW",
            price: "50000.12",
            origQty: "1.234",
            executedQty: "0",
            avgPrice: "0",
            reduceOnly: "false",
          }),
        };
      },
    });
    const trade = new TradeService(client, fakeMarket());
    const result = await trade.modifyOrder({
      symbol: "BTCUSDT",
      side: "BUY",
      quantity: 1.2345,
      price: 50000.123,
      orderId: 1,
    });
    assert.equal(captured.quantity, 1.234, "数量应按 stepSize 规整");
    assert.equal(captured.price, 50000.12, "价格应按 tickSize 规整");
    assert.equal(result.orderId, 5);
    assert.equal(result.origQty, 1.234);
  });
});

describe("TradeService 算法单", () => {
  test("placeAlgoOrder 映射结果", async () => {
    const client = createFakeClient({
      newAlgoOrder: {
        algoId: 10,
        clientAlgoId: "a1",
        algoType: "CONDITIONAL",
        orderType: "STOP_MARKET",
        symbol: "BTCUSDT",
        side: "SELL",
        positionSide: "BOTH",
        algoStatus: "NEW",
        quantity: "1",
        price: "0",
        triggerPrice: "49000",
      },
    });
    const trade = new TradeService(client, fakeMarket());
    const result = await trade.placeAlgoOrder({
      symbol: "BTCUSDT",
      side: "SELL",
      type: "STOP_MARKET",
      quantity: 1,
      triggerPrice: 49000,
    });
    assert.equal(result.algoId, 10);
    assert.equal(result.orderType, "STOP_MARKET");
    assert.equal(result.triggerPrice, 49000);
  });

  test("cancelAlgoOrder 缺标识抛错", async () => {
    const trade = new TradeService(createFakeClient({}), fakeMarket());
    await assert.rejects(() => trade.cancelAlgoOrder({}), /clientAlgoId 或 algoId/);
  });
});

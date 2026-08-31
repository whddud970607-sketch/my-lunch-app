import { DeliveryCompletionService } from "./delivery-completion.service";

function mockLegacyClient(handlers: {
  proofInsert?: { error: unknown };
  pointSelect?: { data: unknown; error: unknown };
  pointUpdate?: { error: unknown };
}) {
  const from = (table: string) => {
    if (table === "delivery_proofs") {
      return {
        insert: async () => handlers.proofInsert ?? { error: null },
      };
    }
    if (table === "delivery_points") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () =>
              handlers.pointSelect ?? { data: { status: "pending" }, error: null },
          }),
        }),
        update: () => ({
          eq: async () => handlers.pointUpdate ?? { error: null },
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  };
  return { from } as never;
}

function mockAtomicClient(rpcResult: {
  data?: unknown;
  error?: { code?: string; message?: string } | null;
}) {
  return {
    rpc: async (_name: string, _args: unknown) => ({
      data: rpcResult.data ?? null,
      error: rpcResult.error ?? null,
    }),
  } as never;
}

describe("DeliveryCompletionService", () => {
  const service = new DeliveryCompletionService();

  describe("atomic idempotent path (RPC)", () => {
    it("returns duplicate for same idempotency key + same hash", async () => {
      const client = mockAtomicClient({
        data: {
          ok: true,
          resultCode: "duplicate",
          pointId: "11111111-1111-1111-1111-111111111111",
          status: "completed",
          receiptBody: {
            resultCode: "duplicate",
            pointId: "11111111-1111-1111-1111-111111111111",
            status: "completed",
          },
        },
      });
      const result = await service.completePoint(client, {
        pointId: "11111111-1111-1111-1111-111111111111",
        driverId: "22222222-2222-2222-2222-222222222222",
        storagePath: "22222222-2222-2222-2222-222222222222/11111111-1111-1111-1111-111111111111/op.jpg",
        idempotencyKey: "key-1",
        payloadHash: "abc",
      });
      expect(result.ok).toBe(true);
      expect(result.resultCode).toBe("duplicate");
    });

    it("rejects same key with different payload hash", async () => {
      const client = mockAtomicClient({
        data: {
          ok: false,
          resultCode: "rejected",
          pointId: "11111111-1111-1111-1111-111111111111",
          status: "conflict",
          code: "idempotency_payload_mismatch",
          receiptBody: { errorCode: "idempotency_payload_mismatch" },
        },
      });
      const result = await service.completePoint(client, {
        pointId: "11111111-1111-1111-1111-111111111111",
        driverId: "22222222-2222-2222-2222-222222222222",
        storagePath: "22222222-2222-2222-2222-222222222222/11111111-1111-1111-1111-111111111111/op.jpg",
        idempotencyKey: "key-1",
        payloadHash: "different",
      });
      expect(result.ok).toBe(false);
      expect(result.code).toBe("idempotency_payload_mismatch");
    });

    it("applies atomic success without PII in receiptBody", async () => {
      const client = mockAtomicClient({
        data: {
          ok: true,
          resultCode: "applied",
          pointId: "11111111-1111-1111-1111-111111111111",
          status: "completed",
          receiptBody: {
            resultCode: "applied",
            pointId: "11111111-1111-1111-1111-111111111111",
            status: "completed",
          },
        },
      });
      const result = await service.completePoint(client, {
        pointId: "11111111-1111-1111-1111-111111111111",
        driverId: "22222222-2222-2222-2222-222222222222",
        storagePath: "22222222-2222-2222-2222-222222222222/11111111-1111-1111-1111-111111111111/op.jpg",
        idempotencyKey: "key-2",
        payloadHash: "hash2",
      });
      expect(result.ok).toBe(true);
      expect(result.resultCode).toBe("applied");
      expect(result.receiptBody).not.toHaveProperty("latitude");
      expect(JSON.stringify(result.receiptBody)).not.toMatch(/password|otp|token/i);
    });

    it("maps unauthorized / invalid_status / malformed_storage_path", async () => {
      for (const code of [
        "unauthorized",
        "invalid_status",
        "malformed_storage_path",
        "forbidden_assignment",
      ]) {
        const client = mockAtomicClient({
          data: {
            ok: false,
            resultCode: "rejected",
            pointId: "11111111-1111-1111-1111-111111111111",
            status: "failed",
            code,
            receiptBody: { errorCode: code },
          },
        });
        const result = await service.completePoint(client, {
          pointId: "11111111-1111-1111-1111-111111111111",
          driverId: "22222222-2222-2222-2222-222222222222",
          storagePath: "x",
          idempotencyKey: "k",
          payloadHash: "h",
        });
        expect(result.ok).toBe(false);
        expect(result.code).toBe(code);
      }
    });

    it("maps rpc transport error", async () => {
      const client = mockAtomicClient({
        error: { code: "57014", message: "timeout" },
      });
      const result = await service.completePoint(client, {
        pointId: "11111111-1111-1111-1111-111111111111",
        driverId: "22222222-2222-2222-2222-222222222222",
        storagePath: "d/p/x.jpg",
        idempotencyKey: "k",
        payloadHash: "h",
      });
      expect(result.ok).toBe(false);
      expect(result.code).toBe("57014");
    });
  });

  describe("legacy map-spike path (no idempotency key)", () => {
    it("applies domain write without receipt", async () => {
      const client = mockLegacyClient({
        proofInsert: { error: null },
        pointUpdate: { error: null },
      });
      const result = await service.completePoint(client, {
        pointId: "11111111-1111-1111-1111-111111111111",
        driverId: "22222222-2222-2222-2222-222222222222",
        storagePath: "d/p/op.jpg",
      });
      expect(result.ok).toBe(true);
      expect(result.resultCode).toBe("applied");
    });

    it("treats proof unique + completed point as duplicate", async () => {
      const client = mockLegacyClient({
        proofInsert: { error: { code: "23505" } },
        pointSelect: { data: { status: "completed" }, error: null },
      });
      const result = await service.completePoint(client, {
        pointId: "11111111-1111-1111-1111-111111111111",
        driverId: "22222222-2222-2222-2222-222222222222",
        storagePath: "d/p/op.jpg",
      });
      expect(result.ok).toBe(true);
      expect(result.resultCode).toBe("duplicate");
    });
  });
});

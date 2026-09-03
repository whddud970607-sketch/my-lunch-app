import { Injectable, Logger } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ImportSourceFormat } from "./import.types";
import type { ImportCommitRpcRow } from "./import-commit.types";
import { mapCommitRpcResult } from "./import-commit.response";

@Injectable()
export class ImportCommitRepository {
  private readonly logger = new Logger(ImportCommitRepository.name);

  async rpcCommitImportBatch(
    userClient: SupabaseClient,
    args: {
      commitIdempotencyKey: string;
      sourceId: string;
      format: ImportSourceFormat;
      serviceDate: string;
      rows: ImportCommitRpcRow[];
    },
  ) {
    const { data, error } = await userClient.rpc("commit_import_batch_atomic", {
      p_commit_idempotency_key: args.commitIdempotencyKey,
      p_source_id: args.sourceId,
      p_format: args.format,
      p_service_date: args.serviceDate,
      p_rows: args.rows,
    });

    if (error) {
      this.logger.warn(`commit_import_batch_atomic failed code=${error.code}`);
      return mapCommitRpcResult({
        ok: false,
        resultCode: "rejected",
        code: error.code ?? "rpc_failed",
      });
    }

    return mapCommitRpcResult(data);
  }
}

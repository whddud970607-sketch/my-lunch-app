/** Worker RPC names — must match migration 025 draft. */

export const RESOLUTION_WORKER_RPC = {
  listEligibleDrivers: "resolution_worker_list_eligible_drivers",
  claimBatch: "resolution_worker_claim_batch",
  fetchPii: "resolution_worker_fetch_pii",
  executionStart: "resolution_worker_execution_start",
  heartbeat: "resolution_worker_heartbeat",
  persist: "resolution_worker_persist",
  releaseClaim: "resolution_worker_release_claim",
  manualRequeue: "resolution_worker_manual_requeue",
  getPoint: "resolution_worker_get_point",
} as const;

export const WORKER_MUTATION_RPCS = [
  RESOLUTION_WORKER_RPC.claimBatch,
  RESOLUTION_WORKER_RPC.executionStart,
  RESOLUTION_WORKER_RPC.heartbeat,
  RESOLUTION_WORKER_RPC.persist,
  RESOLUTION_WORKER_RPC.releaseClaim,
  RESOLUTION_WORKER_RPC.manualRequeue,
] as const;

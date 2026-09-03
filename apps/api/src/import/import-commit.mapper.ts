import type { NormalizedDeliveryDraft } from "./import.types";
import type { ImportCommitRpcRow } from "./import-commit.types";
import { composeDetailAddressWithComplex } from "./import-detail-compose";

export function draftsToCommitRpcRows(
  drafts: NormalizedDeliveryDraft[],
): ImportCommitRpcRow[] {
  return drafts.map((d) => ({
    rowIndex: d.rowIndex,
    trackingCode: d.trackingCode ?? "",
    externalId: d.externalId,
    quantity: d.quantity ?? 1,
    displayLabel: d.displayLabel,
    customerName: d.customerName,
    rawAddress: d.addressRaw,
    detailAddress: composeDetailAddressWithComplex(
      d.complexName,
      d.detailAddress,
    ),
    deliveryMemo: d.deliveryMemo,
  }));
}

/** Delivery session + recorded GPS route (not planned routes table). */

export type DeliverySessionStatus =
  | "active"
  | "ending"
  | "completed"
  | "abandoned";

export type DeliverySessionSummarySnapshot = {
  totalPoints: number;
  completedPoints: number;
  incompletePoints: number;
  failedPoints: number;
  totalQuantity?: number;
};

export type DeliveryRoutePointDto = {
  sequenceNo: number;
  recordedAt: string;
  latitude: number;
  longitude: number;
  accuracyM?: number | null;
  speedMps?: number | null;
  headingDeg?: number | null;
  source?: string;
};

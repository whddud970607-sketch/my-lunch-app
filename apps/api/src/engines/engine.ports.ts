/**
 * Cross-engine ports (foundation only — no providers installed).
 * Keep Map rendering, Access Secrets, and Navigation separate.
 */

export type AddressResolveResult = {
  normalizedAddress: string;
  latitude: number;
  longitude: number;
  confidence: number;
  provider: string;
  providerPlaceId?: string | null;
};

export interface AddressResolver {
  resolve(address: string): Promise<AddressResolveResult | null>;
  normalize(address: string): Promise<string>;
  candidateSearch(address: string): Promise<AddressResolveResult[]>;
}

export type ScanInputKind =
  | "camera_barcode"
  | "qr"
  | "hid"
  | "bluetooth"
  | "spp"
  | "ble"
  | "vendor_pda"
  | "manual";

export type ScanInput = {
  kind: ScanInputKind;
  rawValue: string;
  capturedAt: string;
};

export type ScanResult = {
  resolved: boolean;
  shipmentId?: string | null;
  trackingCode?: string | null;
  sourceId?: string | null;
  reason?: string | null;
};

export interface ScannerAdapter {
  readonly kind: ScanInputKind;
  /** Hardware/vendor specifics stay behind this adapter. */
  captureOnce(): Promise<ScanInput>;
}

export interface IdentifierResolver {
  resolve(input: ScanInput): Promise<ScanResult>;
}

export type RouteStopInput = {
  pointId: string;
  latitude: number;
  longitude: number;
  priority?: number | null;
  dueAt?: string | null;
  locked?: boolean;
};

export type RoutePlan = {
  orderedPointIds: string[];
  reasons: string[];
  estimatedArrivalByPointId?: Record<string, string>;
};

export interface RouteOptimizer {
  optimize(input: {
    originLat: number;
    originLng: number;
    stops: RouteStopInput[];
  }): Promise<RoutePlan>;
}

export type SlaLevel = "NORMAL" | "ATTENTION" | "AT_RISK" | "LATE";

export interface SlaEvaluator {
  evaluate(input: {
    dueAt?: string | null;
    priority?: number | null;
    estimatedArrivalAt?: string | null;
  }): SlaLevel;
}

export type NavigationTarget = {
  latitude: number;
  longitude: number;
  label?: string;
};

/** Opens external navi for current stop — does not own Delivery domain. */
export interface NavigationEngine {
  openTurnByTurn(target: NavigationTarget): Promise<void>;
}

export type DomainNotificationKind =
  | "sla_imminent"
  | "unresolved_delivery"
  | "sync_failure"
  | "route_recalculated"
  | "assignment_changed"
  | "workday_ending_issue";

export type DomainNotification = {
  kind: DomainNotificationKind;
  title: string;
  body: string;
  /** Never include PII, secrets, or raw GPS here. */
  refIds?: Record<string, string>;
};

export interface NotificationSink {
  notify(n: DomainNotification): Promise<void>;
}

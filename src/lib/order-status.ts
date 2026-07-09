import { OrderStatus } from "./types";

const LEGACY_MAP: Record<string, OrderStatus> = {
  open: "pending",
  dispatching: "active",
  in_progress: "active",
  complete: "completed",
};

export function normalizeOrderStatus(status?: string): OrderStatus {
  if (!status) return "pending";
  if (status === "pending" || status === "active" || status === "completed" || status === "cancelled" || status === "invoiced") {
    return status;
  }
  return LEGACY_MAP[status] ?? "pending";
}

export function orderStatusLabel(status: OrderStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

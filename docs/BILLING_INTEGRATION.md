# Billing integration contract

This document describes how the **petrafi-inspiration** prototype relates to the live Petrafi platform in [Petrafi-Inc/sales-proposal-building-tool](https://github.com/Petrafi-Inc/sales-proposal-building-tool).

**Important:** This repo is the developer-facing prototype. Do **not** push billing or ops changes to the production repository. Use this file as the integration boundary when wiring real systems.

---

## Responsibility split

| Concern | petrafi-inspiration (prototype) | sales-proposal-building-tool (production) |
|---------|----------------------------------|-------------------------------------------|
| Quotes / CRM | Yes | Yes |
| Orders | Prototype UI + local/D1 storage | Expected source of truth for live ops |
| Dispatch / GPS | Status fields only | Real driver workflow |
| Delivery tickets | Manual entry + approval gate | Upload / OCR / mobile |
| Customer invoices (AR) | Auto draft on ticket approve + PDF | Production billing |
| Carrier settlements (AP) | Auto draft on haul ticket approve | Production AP |
| Vendor payables (AP) | Auto draft on material/disposal approve | Production AP |

---

## Stable identifiers

Events and API payloads should reference these IDs consistently:

| ID | Entity | Created when |
|----|--------|--------------|
| `quoteId` | Approved sales quote | Quote approved in CRM |
| `orderId` | Job order | Order created from quote |
| `orderLineId` | Route line snapshot | Order creation |
| `dispatchId` | Carrier assignment | Load dispatched |
| `tripId` | Trip (TRP…) | Dispatch assignment creates trip |
| `ticketId` | Delivery ticket (TKT…) | Driver / ops records delivery |
| `invoiceId` | Customer invoice (AR) | Auto-created/updated on ticket approve |
| `settlementId` | Carrier settlement (AP — haul) | Auto-created/updated on haul ticket approve |
| `vendorSettlementId` | Vendor payable (AP — material/disposal) | Auto-created/updated on material/disposal approve |

Number formats in the prototype (aligned with staging):

| Entity | Format | Example |
|--------|--------|---------|
| Order | `ORD` + 9 digits | `ORD000000001` |
| Trip | `TRP` + 9 digits | `TRP000000001` |
| Ticket | `TKT` + 9 digits | `TKT000000001` |
| Invoice | `INV` + 9 digits | `INV000000001` |
| Carrier settlement | `STL` + 9 digits | `STL000000001` |
| Vendor payable | `VAP` + 9 digits | `VAP000000001` |

Order statuses: `pending`, `active`, `completed`, `cancelled`, `invoiced`.

Ticket statuses: `pending_review`, `approved`, `rejected`.

---

## Approve → billing event (prototype)

When ops clicks **Save & Approve** on `/tickets/[id]`, [`billing-on-approve.ts`](../src/lib/billing-on-approve.ts) runs immediately (no modal):

1. Ticket status → `approved`
2. **AR:** append invoice line to existing draft for order, or create new draft invoice
3. **Carrier AP:** if `lineType === haul`, append to draft carrier settlement for dispatch carrier
4. **Vendor AP:** if `lineType === material` or `disposal`, append to draft vendor payable

Idempotency: documents that already contain the ticket's `deliveryTicketId` are skipped (safe to re-run).

Reject (`status === rejected`) leaves billing unchanged.

---

## Event stubs (future webhooks)

Production can emit events; billing services subscribe:

| Event | Suggested payload | Prototype behavior |
|-------|-------------------|-------------------|
| `ticket.approved` | `{ ticketId, orderId, tripId, dispatchId, qty, lineType }` | Runs full billing-on-approve orchestrator |
| `order.complete` | `{ orderId, projectId }` | Manual Complete on order detail |
| `invoice.sent` | `{ invoiceId, orderId, contractorId }` | Stub at `POST /api/invoices/send` |
| `settlement.approved` | `{ settlementId, carrierId, netPay }` | Carrier haul AP |
| `vendorSettlement.approved` | `{ vendorSettlementId, vendorId, payeeKind, netPay }` | Material or disposal AP |

---

## Field mapping (staging parity)

| Prototype field | Staging / production | Notes |
|-----------------|----------------------|-------|
| `Order.number` | ORD… | Global orders list |
| `Order.status` | Pending / Active / Completed | Maps legacy `open`, `dispatching`, etc. |
| `Order.scheduledAt` | Scheduled column | Optional |
| `Order.taxExempt` | Job info tax exempt | Boolean + optional number |
| `Trip.number` | TRP… | Grouped in tickets inbox |
| `Trip.truckLabel` | Fleet truck label | String on trip/dispatch |
| `DeliveryTicket.number` | TKT… | System ticket number |
| `DeliveryTicket.paperTicketNumber` | Paper # on ticket review | Editable before approve |
| `DeliveryTicket.tripId` | Trip grouping | Links ticket to TRP |
| `OrderLine.haulSellRate` | Haul sell on route | Snapshot at order time |
| `OrderLine.haulBuyRate` | Haul buy on route | Used for carrier AP |
| `DeliveryTicket.qty` | Delivered qty | Actual delivered quantity |
| `DeliveryTicket.status` | Pending / Approved / Rejected | Must be `approved` before billing |
| `CustomerInvoice.lines[].deliveryTicketId` | Invoice line source | Idempotency key |
| `CarrierSettlement.brokerFee` | Broker on haul | From org `haulBrokerFeePercent` |

---

## Pricing rules (must match)

**Customer invoice (AR)**

- Material: `materialSellRate × ticket.qty` (per material line when multi-material)
- Haul: `haulSellRate × ticket.qty`
- Tax: `taxRate` on taxable material lines only (haul is non-taxable)

**Carrier settlement (AP — haul only)**

- Haul: `haulBuyRate × ticket.qty`; broker fee = gross × `haulBrokerFeePercent / 100`; net = gross − broker

**Vendor payable (AP — material & disposal)**

- Material: `materialBuyRate × ticket.qty` → pay pickup quarry / material catalog vendor
- Disposal: `disposalBuyRate × ticket.qty` → pay dropoff disposal vendor

Implementation references:

- [`src/lib/billing-on-approve.ts`](../src/lib/billing-on-approve.ts) — orchestrator
- [`src/lib/billing-ar.ts`](../src/lib/billing-ar.ts)
- [`src/lib/billing-ap.ts`](../src/lib/billing-ap.ts) — carrier haul
- [`src/lib/billing-ap-vendor.ts`](../src/lib/billing-ap-vendor.ts) — material + disposal vendors
- [`src/lib/billing-ledger.ts`](../src/lib/billing-ledger.ts) — open/paid buckets, party filters, balance summaries
- [`src/lib/billing-notes.ts`](../src/lib/billing-notes.ts) — append-only notes on AR/AP documents
- [`src/lib/billing-disputes.ts`](../src/lib/billing-disputes.ts) — vendor payable dispute workflow

---

## Follow-up activities and notes

| Feature | AR (`CustomerInvoice`) | Carrier AP | Vendor AP |
|---------|------------------------|------------|-----------|
| Activities | Yes — `Activity.customerInvoiceId` | Yes — `Activity.carrierSettlementId` | Yes — `Activity.vendorSettlementId` |
| Notes | `CustomerInvoice.notes[]` | `CarrierSettlement.notes[]` | `VendorSettlement.notes[]` |
| Dispute | — | — | `VendorSettlement.status = disputed` + `dispute` object |

Notes are append-only (`BillingNote`: `id`, `body`, `createdAt`). Activities reuse the CRM activity types (call, meeting, jobsite visit) and appear on the global `/activities` page with links back to the billing document.

**Vendor dispute:** Allowed when status is `draft` or `approved`. Sets `status` to `disputed`, stores `reason`, optional `correctRate` ($/unit), and optional `correctAmount`. **Record payment** is blocked while disputed. **Resolve dispute** returns status to `approved`.

---

## Open vs paid buckets

| Module | Open statuses | Paid status | Excluded |
|--------|---------------|-------------|----------|
| AR (`CustomerInvoice`) | `draft`, `sent` | `paid` | `void` |
| AP (`CarrierSettlement`, `VendorSettlement`) | `draft`, `approved`, `disputed` | `paid` | — |

**URL query params:**

| Param | Used on | Purpose |
|-------|---------|---------|
| `bucket` | AR, AP | `open` (default), `paid`, `all` |
| `company` | AR | Filter to contracting company slug |
| `contractorId` | AR | Filter to single contact |
| `tab` | AP | `all`, `carriers`, `vendors` |
| `vendorId` | AP | Filter to one vendor |
| `carrierId` | AP | Filter to one carrier |
| `disputed` | AP | `1` — show only disputed vendor payables |

Detail pages: `/billing/invoices/[id]`, `/billing/ap/[id]?kind=carrier|vendor`.

---

## Verification checklist (prototype)

1. Home → Orders → open order — sections match staging layout
2. Dispatch board — assign carrier/truck to order line for today
3. Tickets Inbox — pending orders, tickets grouped by trip (TRP)
4. Save & Approve ticket → draft invoice appears in **Accounts Receivable** (`/billing/invoices`)
5. Haul ticket → draft carrier row in **Accounts Payable** (`/billing/ap?tab=carriers`)
6. Material/disposal ticket → draft vendor row in **Accounts Payable** (`/billing/ap?tab=vendors`)
7. Re-approving same ticket does not duplicate billing lines
8. Order Billing Summary shows delivered qty after approval
9. Contractor company page AR card deep-links to filtered AR; vendor page AP card deep-links to filtered AP
10. AR/AP detail pages — add follow-up activity, add note, dispute vendor payable and resolve
11. Record payment on AR/AP (check or ACH + reference); status becomes paid only after payment recorded
12. AP approve sets due date from vendor/carrier payment terms; overdue filter and aging strip on ledgers
13. Manual vendor bill on AP; manual AR invoice on AR; 3-way match panel on AP detail
14. Vendor detail shows AP profile (contact, terms, tax ID, W-9)
15. No commits pushed to `Petrafi-Inc/sales-proposal-building-tool`

Local dev: `npm run dev` → http://localhost:3002

---

## Prototype roadmap (gap analysis)

This section tracks AR/AP features against enterprise accounting systems. **Phase 1–2** are implemented in this repo; **Phase 3** items are production contract targets only.

### Implemented (Phase 1 — MVP accounting)

| Feature | Implementation |
|---------|----------------|
| Vendor/carrier payee master | `Vendor` / `Carrier` contact, `paymentTermsDays`, `taxId`, `w9OnFile`; migration `0020_payee_master.sql` |
| AP due dates | `dueDate` on `CarrierSettlement` / `VendorSettlement`; set on approve via [`billing-approve.ts`](../src/lib/billing-approve.ts) |
| Overdue + aging 30/60/90 | [`billing-aging.ts`](../src/lib/billing-aging.ts); filter chips + `AgingSummaryStrip` on AR/AP ledgers |
| Payment recording | `PaymentRecord` + [`billing-payments.ts`](../src/lib/billing-payments.ts); `RecordPaymentSheet` replaces Mark paid |
| Manual vendor bill | [`billing-manual-vendor.ts`](../src/lib/billing-manual-vendor.ts); duplicate check on `vendorId` + `vendorInvoiceNumber` |

### Implemented (Phase 2 — controls & visibility)

| Feature | Implementation |
|---------|----------------|
| Approver identity | `approvedByUserId`, `approvedAt` on AP; `sentByUserId`, `sentAt` on AR |
| 3-way match (read-only) | [`billing-three-way.ts`](../src/lib/billing-three-way.ts) + `ThreeWayMatchPanel` on AP detail |
| Manual AR invoice + PDF stub | [`billing-manual-ar.ts`](../src/lib/billing-manual-ar.ts); optional `attachmentUrl` |

### Deferred (Phase 3 — do not build in prototype)

| Feature | Why deferred |
|---------|--------------|
| Multi-level approval by $ threshold | Role matrix, escalation, notifications |
| Multiple payment methods (wire, card, v-card) | Extend payment entity later |
| Recurring / scheduled payments | Scheduler + bank integration |
| 1099 / vendor tax reporting | Year-end IRS forms, vendor classification |
| Vendor portal | External auth and submission workflow |
| Invoice OCR / upload intake | PDF URL stub only in prototype |

### New URL query params (aging)

| Param | Used on | Purpose |
|-------|---------|---------|
| `overdue` | AR, AP | `1` — show only overdue open documents |
| `aging` | AR, AP | `current`, `1_30`, `31_60`, `61_90`, `90_plus` |

### Library index (accounting extensions)

- [`src/lib/payee-terms.ts`](../src/lib/payee-terms.ts) — due date from payment terms
- [`src/lib/billing-payments.ts`](../src/lib/billing-payments.ts) — record check/ACH payment
- [`src/lib/billing-aging.ts`](../src/lib/billing-aging.ts) — overdue flags and buckets
- [`src/lib/billing-manual-vendor.ts`](../src/lib/billing-manual-vendor.ts) — manual vendor bills
- [`src/lib/billing-manual-ar.ts`](../src/lib/billing-manual-ar.ts) — manual AR invoices
- [`src/lib/billing-approve.ts`](../src/lib/billing-approve.ts) — approve with due date + approver
- [`src/lib/billing-three-way.ts`](../src/lib/billing-three-way.ts) — order vs ticket vs payable line

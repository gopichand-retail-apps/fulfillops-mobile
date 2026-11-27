# ADR 001 · Fulfillment authority

**Proposed · November 24, 2026**

Use a dedicated TypeScript service and local PostgreSQL engine for OrderFlow's independent manual release namespace. The service resides under this app and starts with a dedicated business and location. Its work identifiers cannot join a CommerceHub or FulfillOps namespace by matching a display reference.

Both inspected FulfillOps copies use process-local storage and replay. Converting the FulfillOps IT copy would require separate authority, durable-state and access-control changes, and a cutover decision before any shared work. An on-device-only ledger cannot establish shared claims or cross-session audit for an employee workflow. A dedicated local service enables that work with explicit constraints at $0 incremental infrastructure cost.

A future integrated deployment must identify one fulfillment writer, map owner records, validate stock posting and compensation, export the legacy namespace, preview mapping and totals, freeze old writes, verify the new reads and cut over once. Preserve history and retain the prior read-only source for a reviewed retention period. Forward-repair via versioned migrations when new records have already committed.

[Evidence and tradeoffs](../03-ARCHITECTURE.md) · [Real-data onboarding](../REAL-DATA-ONBOARDING.md)

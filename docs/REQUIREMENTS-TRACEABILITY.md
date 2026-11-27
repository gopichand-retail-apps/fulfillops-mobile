# Requirements traceability

| Requirement | Owner | Acceptance | Local status |
| --- | --- | --- | --- |
| OF-01 Scoped queue, detail, history and freshness | `src/features/Queue.tsx`, `server/work/queue.ts` | A01–A03, A09–A10 | Implemented and exercised in Android and PostgreSQL. Polling is enabled. Push invalidation depends on measured need. |
| OF-02 Claim, picks, shortages and sealing | `src/features/ActionForm.tsx`, `server/work/transitions.ts` | A03–A06, A12 | Concurrent claim, invalid and partial picks, shortages and exact package contents verified in PostgreSQL. Manual pick verified on Android. Physical camera and wedge checks pending. |
| OF-03 Handoff and cancellation | `server/work/transitions.ts` | A05–A06, A12–A13 | Synthetic handoff and cancellation race verified on separate database connections. Inventory and upstream effects await confirmed owner integration. |
| OF-04 Returned quantities and disposition | `server/work/returns.ts` | A08–A09, A13 | PostgreSQL return race, unit limit, inspection and quarantine verified. Inventory posting and refund projection require owner receipts. |
| OF-05 Scoped cache, draft and replay | `src/data/device.ts`, `server/work/commands.ts` | A06–A07, A09, A12 | Lost response recovery and force-stop draft restore verified on Android. PostgreSQL retains the original claim and receipt. Field data encryption, OS lifecycle and cross-device tests remain open. |
| Stage A design | [Architecture decision](adr/001-fulfillment-authority.md) | Approved local authority and install target | Owner approved continuation. |
| Native release and cost | [Release evidence](RELEASE-EVIDENCE.md) · [Cost register](INFRASTRUCTURE-AND-COST.md) | A12 | Local x86_64 APK and cold launch verified at zero incremental spend. Physical devices, trusted HTTPS, native iOS and publication are pending. |

See [acceptance details](06-TEST-AND-ACCEPTANCE.md) and [current handoff](10-PROGRESS-AND-HANDOFF.md).

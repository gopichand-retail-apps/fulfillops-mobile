# OrderFlow Stage A approval brief

**Architecture proposed November 24, 2026. Owner approved continuation.** See the [implementation handoff](10-PROGRESS-AND-HANDOFF.md) for the current state.

Approve OrderFlow as a native React Native client with a dedicated local TypeScript fulfillment API and PostgreSQL database under this folder. The first workflow starts when an authorized supervisor enters a manually verified release in a distinct business/source namespace. Two employees in that site can compete for the claim. The successful claimant can pick, an authorized packer can seal, and a handoff operator can record an observed pickup. A support viewer can read permitted status and timestamps.

| Decision           | Recommended approval                                                                                                                                                                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| First authority    | A new OrderFlow fulfillment module in `OrderFlow/server/` owns manual releases and warehouse work for a dedicated synthetic business. The FulfillOps original and isolated IT copy are reference implementations.                                                              |
| First source       | A supervisor enters release authority, source document, revision and line quantities. Keep sales, stock and refund state unavailable unless the relevant owner supplies a verified contract.                                                                                   |
| First device       | Dedicated Android emulator with a local development build. Add owner-authorized personal Android hardware for camera and install checks. Target native iOS concurrently and verify it on an eligible Mac.                                                                      |
| First acceptance   | Enter a two-line release into an empty business, race claims using two authenticated sessions and two database connections, restart both API and PostgreSQL, then recover the same winning claim and audit event. Confirm an out-of-site actor cannot read or mutate the work. |
| Budget and release | $0 incremental. Local synthetic development. Any shared-service contract, real data, remote deployment, owner signing key use or publication has its own authorization gate.                                                                                                   |

The architecture addresses shared state, transactional races and site-level authorization. Recommended model is GPT-6.1 Sol at Max reasoning. The current session performed the design review without a confirmed model switch.

## Review path

| Read                                                                                                                                                                     | Decision or evidence                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| [Product requirements](01-PRODUCT-REQUIREMENTS.md) · [User journeys](02-USER-FLOWS-AND-UX.md) · [Screen design](SCREEN-DESIGN-SPEC.md)                                   | Roles, interfaces, workflow and layout                     |
| [Architecture](03-ARCHITECTURE.md) · [ADR 001](adr/001-fulfillment-authority.md)                                                                                         | Service choice, source observations, risks and ownership   |
| [Data and API](04-DATA-AND-API-CONTRACTS.md) · [OpenAPI](openapi.yaml) · [Security](05-SECURITY-AND-PERMISSIONS.md)                                                      | Proposed first-slice contract, constraints and permissions |
| [Acceptance](06-TEST-AND-ACCEPTANCE.md) · [Traceability](REQUIREMENTS-TRACEABILITY.md) · [Performance and accessibility](08-PERFORMANCE-AND-ACCESSIBILITY.md)            | Tests and observable completion conditions                 |
| [Build plan](07-MOBILE-BUILD-AND-RELEASE.md) · [Devices](DEVICE-COMPATIBILITY.md) · [Release evidence](RELEASE-EVIDENCE.md) · [Cost](INFRASTRUCTURE-AND-COST.md)         | Native targets, tool evidence and release gates            |
| [Onboarding](REAL-DATA-ONBOARDING.md) · [Backlog](09-IMPLEMENTATION-BACKLOG.md) · [Handoff](10-PROGRESS-AND-HANDOFF.md) · [Portfolio evidence](11-PORTFOLIO-EVIDENCE.md) | Implementation order, resumption and proof to collect      |

The approved local implementation uses the independent manual namespace and Android-emulator-first target. Use the implementation handoff and release record to review completed checks. Connecting existing sales releases or stock requires a verified upstream release and a single inventory-posting authority.

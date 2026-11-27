# Product requirements

## Audience and jobs

| User             | Job                                                                            | Successful outcome                                                                                    |
| ---------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Picker           | Claim a released job and record what was taken from a particular bin.          | Confirmed quantities reflect the correct SKU and the picker can recover a draft or report a shortage. |
| Packer           | Verify the committed contents and seal a package.                              | A sealed package contains exactly the picked and approved quantities.                                 |
| Handoff operator | Record an observed pickup at the authorized location.                          | One durable handoff receipt with method, time and operator exists.                                    |
| Supervisor       | Release legitimate work, resolve shortages and manage assignments and returns. | Every administrative decision has a reason, actor and revision.                                       |
| Support viewer   | Explain where the job stopped.                                                 | Scoped status and timestamps identify the source and last confirmed activity.                         |

## Scope and authoritative results

1. **OF-01** · Provide a site-authorized, paged queue, exact reference search, detail and history. Distinguish empty, stale and unavailable data. Pull-to-refresh and foreground refresh reconcile from the server. Start with scoped polling and measure its delay before adding push invalidation.
2. **OF-02** · Grant a single claim atomically. Verify manual and camera input against the current line and quantity. Preserve progress after invalid input and let the picker report shortages. Require supervisor approval for a recorded partial release. Substitutions are prohibited in the first operating mode.
3. **OF-03** · Separate claim, pick, pack and actual handoff. Cancel or hold before handoff under server authorization. After handoff, route work to returns. Keep inventory effects under the inventory owner's authority.
4. **OF-04** · Tie returns to actual handed-over line quantities. Record reason, arrival, condition and supervisor disposition. Quarantine unverified units. Show the refund status only with an authorized source.
5. **OF-05** · Support scoped read cache and recoverable pick drafts. Revalidate ownership after reconnect and replay uncertain submissions with the original operation key. Keep pack, handoff, release and cancellation online. Open allowlisted work links only after loading current membership.

Plan one warehouse location per work item, whole-unit quantities, one sealed package and one handoff per work item in the first workflow. Support site-scoped staff roles and multiple sites in the identity model. The [data contract](04-DATA-AND-API-CONTRACTS.md) defines the quantity and transaction rules.

## Operational reports

Site supervisors can inspect the oldest eligible unclaimed job by release timestamp, committed pick units, shortage units, elapsed release-to-handoff for completed work, and unresolved return quantities. Use an explicit site time zone and date window. Compute elapsed time from UTC instants. Count committed facts, show when data was generated, and disclose pending upstream effects separately. Scope exports and integration reports to a later verified slice.

## Boundaries

OrderFlow owns local warehouse work in its approved namespace. Carrier operations, live payments, stock posting, external notifications and cross-app writes are outside the first implementation. Development uses synthetic records entered through the workflow. Live employee and customer records, public distribution and managed-device enrollment have separate authorization requirements. [Onboarding](REAL-DATA-ONBOARDING.md)

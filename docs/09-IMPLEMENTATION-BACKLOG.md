# Ordered implementation backlog

| Slice                                              | Owner and entry dependency                                                                                           | Exit                                                                        |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| A · Design                                         | Workspace owner reviews independent mode, permissions and device target.                                             | Recorded approval of design and eligible first workflow.                    |
| B · Enrollment, manual release and claim           | Identity and fulfillment modules, isolated PostgreSQL, React Native sign-in and queue.                               | A01–A03 and scoped A09. Cold reread from two sessions and durable conflict. |
| C · Pick, seal, actual handoff and reliable replay | Fulfillment commands, device drafts, scanner/manual adapters.                                                        | A04–A07 and A10 on a local connected development build.                     |
| D · Returns and reconciliation                     | Return inspection and dispositions first. Stock/commerce/finance owners separately authorize any integrated effects. | A08, A11 and named authorized integration tests if applicable.              |
| E · Native release                                 | Owner-approved software identity, install targets and signing.                                                       | A12, artifact checks and verified device evidence under the $0 constraint.  |

Finish each slice with checks and update the [handoff](10-PROGRESS-AND-HANDOFF.md) and [traceability](REQUIREMENTS-TRACEABILITY.md). Prioritize native Android smoke after the first source slice. Keep iOS interface and permission handling in scope and record any Mac/Xcode blocker as evidence.

## Learning and review

Optional owner walkthroughs follow each completed slice. Reproduce a claim race and inspect why PostgreSQL admits one winner. Interrupt a response and recover the same receipt from the device. Compare physical handoff and an inventory effect in the audit views. Each walkthrough links to the owning code and test once available. See [interview practice](11-PORTFOLIO-EVIDENCE.md).

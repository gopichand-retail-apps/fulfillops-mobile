# Portfolio evidence plan

OrderFlow is a proposed personal portfolio project for shared warehouse operations. Current portfolio evidence consists of the approved-input review, an ownership analysis and a proposed native workflow and API contract. Device screenshots, executable features and runtime metrics will be added when verified.

| Skill                               | Current design reference                             | Evidence to collect                                               | Owner discussion                                                       |
| ----------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Native warehouse UX                 | [Screen wireframes](SCREEN-DESIGN-SPEC.md)           | Compact Android screenshot, camera denial and large-text capture  | Why scan and quantity confirmation are separate steps                  |
| Shared transactional state          | [Fulfillment contract](04-DATA-AND-API-CONTRACTS.md) | Two-session race and PostgreSQL restart transcript                | What remains true if the first response disappears                     |
| Authorization and offline lifecycle | [Security](05-SECURITY-AND-PERMISSIONS.md)           | Denial matrix, app restart and revoked ownership trace            | What survives process death and who can submit it                      |
| Release engineering                 | [Build plan](07-MOBILE-BUILD-AND-RELEASE.md)         | Signed package hash, manifest and approved install/upgrade result | Which device and environment checks establish the stated release scope |

Practice questions

1. Two pickers claim the same version from different devices. Which storage invariant prevents a second active claim?
2. How do you recover one committed command after a response timeout without replaying a different quantity?
3. Why does an inspected return leave refunds and stock effects with separate authorities?
4. Which of the documented camera and wedge checks require physical hardware?

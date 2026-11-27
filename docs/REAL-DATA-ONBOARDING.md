# Business onboarding and source reconciliation

## First local workflow

1. Start with an empty isolated local PostgreSQL database. The authorized bootstrap operator creates the first owner and site. Set site time zone, enroll staff through scoped expiring invitations and verify their roles independently.
2. Use a synthetic release document authored for acceptance. Enter its issuing authority, order and line references, revision, site, SKU, bin, barcode alias and quantities. Preview the exact normalized snapshot, resolve mapping/quantity errors and commit through the supervisor's session.
3. Capture the receipt ID, then open the same durable work from two authorized site sessions. Confirm hidden cross-site access and concurrent conflict. Record the final confirmed state and audit sequence.

The first slice uses manual document entry. Bulk ingestion and source-file upload are outside that slice. Keep source documents under owner control and persist the minimum reference and quantities needed to operate. Display manual source provenance and unavailable sales/stock/financial status on relevant views.

## Gate for actual operations

Establish the approved business/site, data custodian, authorized release channel, staff access and recovery owner. Decide privacy retention, backups, deletion/export scope and approval, device lock and transfer controls, secure transport, and on-call handling. Use the inventory cutover agreement before connecting an upstream order or posting any adjustment. Reconcile source order/line IDs and revisions, record reject/error counts, and test a synthetic equivalent first. Freeze old writes for the chosen scope, compare mappings/counts, verify new reads, then allow a single writer. Keep recoverable history and document how to request corrections.

[Integration evidence](03-ARCHITECTURE.md#1-observed-boundaries) · [Permission and egress matrix](05-SECURITY-AND-PERMISSIONS.md) · [Acceptance](06-TEST-AND-ACCEPTANCE.md)

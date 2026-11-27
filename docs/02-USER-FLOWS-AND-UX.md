# Warehouse journeys

## Release, claim, pick and handoff

1. The supervisor selects an authorized site, enters release authority and two or more validated line values, previews the record, and commits. Failed or duplicate release attempts show the affected record or field under current authorization.
2. A picker signs in, selects the site and filters available work. Claim confirmation uses the current revision. A concurrent loser receives current state, keeps queue position, and can select the next job.
3. The winning picker verifies one line at a time using camera or manual input. A wrong barcode, duplicate camera frame or excessive count leaves committed progress intact. When a shortage occurs, the picker records affected units and reason, then returns to the task.
4. The supervisor waits for stock or explicitly approves a reduced quantity. The packer verifies approved quantities and seals. A separate authorized operator confirms the physical handoff with method and a business-issued reference after observing the pickup.
5. Support opens the read-only history and reports the latest committed operation, time and available source. An expired link reauthorizes before displaying work.

## Interruption and recovery

- Leaving a pick screen with unsubmitted edits offers **Save draft** and **Keep editing**. A local save is labeled as a draft. A server timeout after submission is labeled **Confirmation pending**. The client checks the receipt or retries the same operation with the original payload and key.
- Offline, the authorized user can read eligible cached work and draft an observation. Reconnect fetches the current grant, claim and revision before presenting a review. When ownership changed, suspend submission and offer supervised resolution.
- Cancel before handoff requires a reason and a fresh revision. If the job already left the site, open return intake. A return can be received and inspected by an authorized operator and dispositioned by a supervisor. Until the inventory authority confirms an effect, the UI describes the units as held or awaiting the corresponding effect.
- A shared-device sign-out first checks for unsettled drafts or commands. Keep the device locked to the originating actor until they resolve them or explicitly discard a local draft. A server-side acceptance receipt remains available to the authorized actor after app sign-in.

[Screen wireframes](SCREEN-DESIGN-SPEC.md) · [Permission matrix](05-SECURITY-AND-PERMISSIONS.md)

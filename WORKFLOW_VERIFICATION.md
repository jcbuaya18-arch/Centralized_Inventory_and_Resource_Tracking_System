# Office Head → Accounting → Engineer Workflow Verification

Read-only code review of the current working tree. The only file written for this verification is this document; no application source files were edited in this step.

## Part 1: What changed

`git diff --name-only` shows six modified application files. All six were in the approved plan.

| File | Functions/components changed | Description |
|---|---|---|
| `types.ts` | `GeneratedReport`, `AssetRequest` | Adds report/requisition link and accounting review fields, status values, and superseded marker (lines 133–155, 289–310). |
| `components/RequisitionsManager.tsx` | `openEditHandler`, `handleSaveNewRequest`, `handleEditRequest`, `handleQuickDecisionWithStatus`; request cards and content modal | Starts Office Head requisitions in Accounting review; adds Accounting edit logging, return/resubmission handling, approval checks, and an Admin paired-document summary (lines 1073–1235, 1249–1490, 1673–1830, 2190–2255, 2960–3095). |
| `components/Reports.tsx` | `Reports` props/state, `handleForwardReport`, draft save/load | Accepts a generated draft, restores requisition linkage in the editor, and has an atomic report/requisition forward branch (lines 10–24, 448–520, 1567–1615, 1792–1860). An older non-atomic branch remains later in this handler (lines 530–620). |
| `components/AccountingDashboard.tsx` | Dashboard state; dashboard compilation queue; `Reports` invocation | Adds a queue with inline review/edit, draft creation, and return-to-Office-Head actions; passes the draft to Reports (lines 119–125, 2743–2760, 5209–5218). |
| `components/OfficeHeadDashboard.tsx` | Dashboard requisition summary | Adds “My Requisitions” with badges for Accounting review and Engineer/Admin review (lines 1808–1818). |
| `firestore.rules` | `isAccounting`; `/requests/{requestId}` rule | Allows Accounting updates when the existing request status is `Pending Accounting Review` (lines 58–64, 113–119). |

`SYSTEM_PROCESS.md` is also untracked in `git status`, but it was already present in the project before this verification/task work and is not part of this task’s diff. No other file outside the approved plan was changed. `offlineDb.ts` and `hooks/useOfflineSync.ts` were not changed.

`WORKFLOW_VERIFICATION.md` itself is the new verification artifact requested in this step; it is not an application source change.

## Part 2: Check against the target flow

1. **PASS** — Office Head + REQUISITION is the condition for the new initial status, and the submission recipient is ACCOUNTING (not ADMIN) in `components/RequisitionsManager.tsx:1153–1170, 1220–1237`. This verifies the code path; it was not exercised in the UI.

2. **PASS (with limitation)** — The Accounting queue exposes article/details, quantity, unit value, and justification fields; saving updates request history and `system_logs` (`components/AccountingDashboard.tsx:2748–2757`). The manager’s accounting-edit path also records history/system log (`components/RequisitionsManager.tsx:1277–1288, 1310–1330, 1460–1468`). Editing an existing multi-item `items_snapshot` is not supported by this inline editor; only top-level request fields are edited.

3. **PARTIAL** — “Generate PAR/ICS Draft” is present and chooses PAR when *any* source row has unit value ≥ 50,000, otherwise ICS (`components/AccountingDashboard.tsx:2758`). The source snapshot is carried through. There is no existing-draft lookup, so each click creates another report. For requisitions already containing `items_snapshot`, inline top-level edits do not update those snapshot rows before generation.

4. **PASS** — The click creates a `reports` document with status `Draft` and `originalRequisitionId` (`components/AccountingDashboard.tsx:2758`). The dashboard passes the draft into Reports, and its seed effect loads the report in the generator and sets it editable (`components/AccountingDashboard.tsx:5209–5218`; `components/Reports.tsx:1855–1862`; report editability depends on draft status at `components/Reports.tsx:1847–1852`).

5. **PASS for the linked-forward branch** — `handleForwardReport` checks authorization, loads the source requisition, and uses one `writeBatch` to update the report and requisition with reciprocal IDs and review status (`components/Reports.tsx:482–504`). Notification and logging happen after the batch commit. This is atomic for those two writes, not for the subsequent notification/log writes.

6. **PASS for linked requisitions** — When an original requisition link is found, the batch branch returns before the generic mirror-request creation path (`components/Reports.tsx:482–510` vs. generic `requests` creation at `components/Reports.tsx:530–581`). The generic path still creates request documents for unrelated/non-linked official reports.

7. **PARTIAL** — The Admin request modal renders two columns for the original requisition and linked report items (`components/RequisitionsManager.tsx:2976–2985`). The report side is a summary of report type/status and item rows, not the complete PAR/ICS document/editor, so it is only a partial side-by-side document view.

8. **FAIL** — The primary quick decision handler checks the link, matching `originalRequisitionId`, report status, and `forwardedStatus` for non-legacy requisitions (`components/RequisitionsManager.tsx:1683–1702`), and the edit handler has a similar check (`components/RequisitionsManager.tsx:1253–1261`). However, both checks explicitly bypass the gate when the requisition status is `PENDING`, which lets Admin change a new request to legacy `PENDING` via the editable status selector (`components/RequisitionsManager.tsx:2780–2815`) and then approve through that bypass. The separate Official Reports approval button updates a report directly (`components/Reports.tsx:3760–3795`) without updating/verifying the linked requisition. Firestore rules also do not enforce the pair on Admin writes (`firestore.rules:113–119`).

9. **FAIL** — Requisition approval does not call `approveAndLinkStockRecord`; it calls `deductInventoryStock`, updates the linked report, then updates the requisition in separate writes (`components/RequisitionsManager.tsx:1748–1755, 1808–1817`). The edit handler has another path that deducts stock and separately updates the report/request (`components/RequisitionsManager.tsx:1363–1372, 1430–1434`). `wasApprovedOrDispatched` prevents a second sequential execution after the request status has committed (`components/RequisitionsManager.tsx:1748–1750`), but this is not a concurrency-safe idempotency guard; two concurrent actions can both observe the old status. There is no atomic update of both documents during approval.

10. **PARTIAL** — Accounting’s return action sets `Returned for Revision`, writes history/log, and notifies OFFICE_HEAD (`components/AccountingDashboard.tsx:2759`). The Admin return path also notifies Office Head and changes the linked report’s status (`components/RequisitionsManager.tsx:1762–1776`). Office Head resubmission resets status and clears the old link; where a linked report exists it is marked superseded (`components/RequisitionsManager.tsx:1278–1280, 1348–1354, 1435–1438`). The Accounting-return case usually has no linked report and therefore sends no new ACCOUNTING notification on resubmission (notification is conditional on an old link at lines 1435–1438); the queue will show the request, but the notification step is missing. Admin return marks the old report returned, not superseded, until resubmission.

11. **PASS (legacy path retained)** — The dual-document gate excludes status `PENDING`; the old quick approval route remains in the Admin request card for `PENDING` (`components/RequisitionsManager.tsx:1683, 2214–2231`). This compatibility choice also creates the bypass described in item 8.

12. **FAIL** — Each click calls `doc(collection(db,'reports'))` and `setDoc` without looking for a report already linked to that requisition (`components/AccountingDashboard.tsx:2758`). A second click makes a new draft instead of opening the existing one.

13. **PARTIAL** — The Office Head requisition edit form includes a `FORWARDED` status option (`components/RequisitionsManager.tsx:2808–2815`), and the general edit handler can persist a changed status without a role check for requisition status changes (`components/RequisitionsManager.tsx:1249–1251, 1278–1280, 1428–1430`). This lets Office Head self-mark a requisition `FORWARDED`; in the current generic notification branch a non-`PENDING` status notifies OFFICE_HEAD, not ADMIN (`components/RequisitionsManager.tsx:1416–1422`), so I found no matching Engineer-forward operation on that path. The direct-forward status path remains an inconsistent and unsafe leftover, while the actual new submission path routes to Accounting (`components/RequisitionsManager.tsx:1153–1170, 1220–1237`).

14. **PARTIAL** — The new submission status/recipient condition is limited to `userRole === OFFICE_HEAD` and `activeRequestTab === 'REQUISITION'` (`components/RequisitionsManager.tsx:1153–1170, 1220–1237`), and the Accounting queue filters for REQUISITION + Pending Accounting Review (`components/AccountingDashboard.tsx:2748`). Other document/request flows retain their existing branches. But the generic requisition status editor still offers `FORWARDED` and the approval compatibility gate is based on status rather than a durable origin/flow marker. No comprehensive regression testing was performed for the other flows.

15. **Scoped loosening** — `firestore.rules` adds `isAccounting()` based on the signed-in user’s role and changes `/requests` updates from `isAuthorized()` only to `isAuthorized()` OR Accounting when `resource.data.status == 'Pending Accounting Review'` (`firestore.rules:58–64, 113–119`). No other collection rule changed. This is scoped by the record’s prior status, but it allows an Accounting user to update *any fields*, including the status, on such a record; it does not restrict updates to requisition details/history or require the resulting status to remain in an allowed set.

16. **FAIL / not integrated** — `offlineDb.ts` exposes a generic IndexedDB queue, but `hooks/useOfflineSync.ts:20–63` only synchronizes queued records through `handleAddItemFirestore`, the inventory-item callback. No request/report workflow code calls `addOfflineQueue` (repository search found no call sites), and `firebase.ts:28–39` initializes Firestore with empty settings rather than explicitly enabling persistent local cache. The new workflow writes are not queued by `offlineDb`/`useOfflineSync`; offline operation for them was not verified.

17. **PASS** — The Office Head dashboard maps `Pending Accounting Review` to “Awaiting Accounting Review” and `Pending Engineer/Admin Review` to “With Engineer for Approval” (`components/OfficeHeadDashboard.tsx:1808–1818`). Other statuses display their stored status string.

## Part 3: Risks and leftovers

- The legacy `PENDING` exemption is needed to preserve old records, but it is also a gate bypass: an Admin can save a new request as `PENDING` through the status selector, then approve it without the paired report. A durable workflow/origin marker should distinguish legacy requests from Office Head workflow requests.
- Approval of the linked requisition updates stock, report status, and request status separately. Concurrent approvals can both pass the old-status check, and a failure between writes can leave stock/report/request out of sync. `approveAndLinkStockRecord` is not called by the requisition approval branch.
- The Admin can approve the report alone from Reports. That button does not check for or update the linked requisition. The report may become `Approved` while the requisition remains pending.
- Firestore rules do not enforce the document pair or status transition for Admin writes; authorized direct Firestore updates can bypass the UI handler gate. Accounting updates on pending requests are broad field updates, not field-scoped edits.
- Repeated “Generate PAR/ICS Draft” clicks create duplicate drafts. No idempotency key/lookup or single-draft constraint exists.
- The edit form still exposes the legacy direct `FORWARDED` option to Office Head. The new flow does not remove or reject that status transition.
- Accounting’s return-to-Office-Head action is only a dashboard-level write; it does not clear/supersede a linked report or notify Accounting when an Office Head resubmits without a prior report link. Admin returns mark the report “Returned for Revision” and only supersede it when the Office Head resubmits.
- Top-level editing does not reconcile `items_snapshot` rows. Multi-item reports carry existing rows through, but changed top-level quantity/details/value may not be reflected in those rows.
- The paired Admin modal is a summary display rather than a full report preview. No UI workflows, Firestore emulator/security-rule tests, or offline tests were run.

## Part 4: Test results

`npm run lint` was run. Result:

```text
> centralized-inventory-and-resource-tracking-system-of-lgu-tibiao@0.0.0 lint
> tsc --noEmit
```

The command exited successfully with no TypeScript diagnostics.

Flows actually run/tested: none end-to-end. This verification used source inspection, `git status`/`git diff`, and the required TypeScript lint only. Office Head submission, Accounting editing/draft/forwarding, Admin paired approval/return, legacy approval, duplicate draft prevention, and offline behavior were not executed in the app or against Firestore.

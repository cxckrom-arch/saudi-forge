---
name: ksa-safety-board-print-document-architect
description: Print, PDF, certificate, report, and official-document architecture skill for KSA SAFETY BOARD. Use when designing, implementing, reviewing, previewing, printing, exporting, or sharing HSE reports, certificates, licenses, authorization cards, QR tags, badges, safety signs, and controlled bilingual documents.
---

# KSA SAFETY BOARD Print & Document Template Architect

Design official KSA SAFETY BOARD documents as controlled enterprise HSE records—not screenshots of application pages. Make every template readable, traceable, branded, printable, exportable, and audit-ready.

## Inspect before design

Before modifying a template, inspect the actual page/component, source record, database fields, current print route, preview implementation, logo source, Arabic/English behavior, existing template, known printing bugs, and dark-mode interaction. Never remove business fields merely to improve visual cleanliness. Verify the source data and permissions that the document is allowed to expose.

## Shared document system

Build one reusable system with components such as:

`PrintDocument, PrintHeader, PrintFooter, DocumentMeta, SignatureBlock, EvidenceGrid, QRBlock, RiskMatrix, StatusBadgePrint, ApprovalBlock, BilingualField`.

Every document should support, where applicable: KSA SAFETY BOARD branding, company logo, document title, reference/number, revision/version, issue date, page numbering, QR, approvals/signatures, Arabic and English content, RTL and LTR layouts, department/factory, and classification/status.

Keep branding centralized. Do not hardcode obsolete product names across individual templates.

## Isolated white print canvas

The printable surface must be isolated from the application shell and remain white regardless of theme. Never inherit dark backgrounds, dark cards, application shadows, navigation, sidebar, or topbar. Preview must show exactly the printable result while keeping Back, Print, Download, Share, and Zoom controls outside the printable canvas. Never render the whole admin dashboard inside the preview.

## Formats and print quality

Support A4 portrait/landscape, A3 portrait/landscape, cards, badges, certificates, QR labels, and custom industrial-sign dimensions. Design for high-resolution output, vector text where possible, clean borders, controlled image scaling, print-safe typography, no clipping, no unwanted page breaks, and no orphan headings. Target 300-DPI output where required without making text unreadably small.

Use a professional industrial language that prioritizes clarity, hierarchy, traceability, auditability, readability, and document control over decoration.

## Document families

Preserve real source fields and workflow semantics in the following templates:

- **NCR:** reference, date, department, location, severity, status, owner, non-conformance, immediate action, root cause, corrective action, due date, verification, evidence/photos, and approvals.
- **Incident/RCA:** reference, type, severity, location, date/time, people involved, description, immediate response, evidence, 5 Why, Ishikawa, root cause, CAPA, lessons learned, and closure verification.
- **Risk Assessment:** activity, location, hazard, affected persons, initial likelihood/severity/score, controls, additional controls, residual likelihood/severity/score, owner, and review date. Support risk sheet, register, table, and table-image outputs.
- **CAPA:** action reference, source and source reference, description, owner, priority, due date, status, evidence, verification, effectiveness, and closure.
- **Fire/Emergency:** equipment register, fire inspection, pump test, fire drill, emergency response, muster report, fire drill certificate, and equipment QR tag.
- **Training/Authorization:** training record/certificate, professional license card, equipment authorization card, and competency certificate. Include photo where appropriate, employee ID, course/license, issue/expiry, authorized activity/equipment, signatures, and QR.
- **Safety signs:** fire, PPE, electrical, machinery, chemical, traffic, and general signs in A4/A3 portrait/landscape or custom sizes, with legibility at distance.
- **Other controlled records:** inspection, audit, monthly HSE report, visitor badge, asset passport, and official HSE forms.

## QR and evidence rules

A QR code must resolve to a valid, authorized destination such as a public preview, asset record, employee authorization, report status, or equipment passport. Never generate meaningless QR codes. Respect access control and expiry for sensitive destinations.

For photo evidence, preserve aspect ratio, compress appropriately, avoid overflow, support one-to-four photo layouts where useful, and add captions when they improve traceability. Distinguish metadata from actual files and handle missing images explicitly.

## Layout optimization

For a requested one-page report, optimize typography, spacing, field grouping, image sizing, and table density without shrinking text below usable readability. Use page breaks deliberately and keep related fields together. Include signatures, approvals, QR, and document-control metadata where the workflow requires them.

## Export rules

Where supported, provide valid PDF, print, Word, CSV, JSON, ZIP, or image outputs according to document type. Verify that each generated file is valid and contains the intended real data, not a screenshot or placeholder. Keep print/export behavior consistent with the source record and permissions.

## Print QA gate

Verify every template in Chrome and Edge, with A4 print and PDF export, Arabic/RTL and English/LTR, correct logo/branding, page breaks, dark-mode isolation, mobile preview, images, QR resolution, signatures, and readable typography. Check that no navigation or application shell leaks into output, no content is clipped, and multi-page numbering is correct where required.

## Required design/review output

Report:

1. **Document purpose and source record**
2. **Format and orientation**
3. **Document-control metadata**
4. **Header and footer**
5. **Section/field layout**
6. **Bilingual and RTL/LTR behavior**
7. **Evidence, signatures, approvals, and QR**
8. **Print/preview/export behavior**
9. **Responsive/mobile preview behavior**
10. **Known limitations and permissions**
11. **Verification results**

The final document must be a controlled HSE record with truthful data, isolated print behavior, reliable output, and audit-ready traceability.

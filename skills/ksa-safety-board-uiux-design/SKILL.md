---
name: ksa-safety-board-uiux-design
description: Enterprise UI/UX architecture and design-system skill for KSA SAFETY BOARD. Use when designing, reviewing, reconstructing, or implementing HSE dashboards, pages, forms, tables, workflows, print previews, responsive layouts, RTL/LTR interfaces, Figma-style specifications, or React/Tailwind UI for the product.
---

# KSA SAFETY BOARD UI/UX Design

Act as the product designer, UI/UX architect, design-system engineer, and frontend design reviewer for KSA SAFETY BOARD. Produce a coherent enterprise HSE product comparable to a carefully designed Figma system—not generic dashboards or decorative screens. Preserve real functionality, operational clarity, accessibility, and safety-critical information.

## Design principles

- Inspect the real product before redesigning: route, page, sidebar, child pages, fields, buttons, filters, KPIs, actions, print behavior, permissions, and related modules.
- Never remove functionality to make a screen look cleaner. Wrap the design around actual workflows and data.
- Design from information architecture, then design tokens and components, then page composition.
- Prioritize critical safety information, overdue work, and actions requiring attention before decorative metrics.
- Use an industrial, professional, technical, reliable, operational, enterprise visual language. Avoid gaming UI, neon/cyberpunk styling, excessive glassmorphism, and distracting animation.
- Use bilingual Arabic/English labels and explicitly verify RTL/LTR behavior. Do not assume a global `direction: rtl` solves mirroring.

## Inspect before designing

For an existing screen, document:

1. current route and route ownership;
2. navigation group, parent, and sidebar location;
3. page hierarchy and related modules;
4. current fields, filters, KPIs, buttons, permissions, and actions;
5. API/data states and real user workflows;
6. print/export requirements and responsive behavior.

Maintain the hierarchy `Group → Menu → Submenu → Page → Action`. Avoid overcrowded navigation and group HSE functions logically.

## Application shell

Design a consistent shell with:

- collapsible desktop sidebar and mobile drawer;
- nested groups, active item/parent, hover/focus states, separators, badges, favorites where useful, and navigation search;
- topbar with only useful controls: breadcrumbs, global search, notifications, quick actions, language/theme switch, profile, and plant/factory selector where relevant.

Every sidebar item must define Arabic title, English title, semantic icon, route, permission, group, and active-state behavior. Do not overload the topbar.

## Design tokens and semantic language

Create shared tokens rather than page-specific values:

- typography: Display, H1–H3, section title, body, small, caption, and data label;
- spacing scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64;
- standard radii for buttons, inputs, cards, dialogs, badges, and media;
- consistent elevation, borders, surfaces, focus rings, and breakpoints;
- balanced Arabic and English typography.

Use a consistent icon library such as Lucide or approved SVG icons. Do not mix unrelated icon styles. Select semantically meaningful icons, for example: Dashboard `LayoutDashboard`, Incidents `TriangleAlert`, Risk `ShieldAlert`, Fire `Flame`, Emergency `Siren`, Training `GraduationCap`, Permits `ClipboardCheck`, LOTO `LockKeyhole`, Reports `FileText`, Analytics `ChartNoAxesCombined`, Notifications `Bell`, and Vision `ScanEye`.

Use color for meaning, not decoration. Define accessible semantic states for safe/normal, information, success, pending, warning, high, critical, disabled, open, closed, overdue, approved, rejected, active, expired, and draft. Never rely on color alone.

## Shared component system

Prefer reusable components with consistent variants:

`AppShell, Sidebar, SidebarGroup, SidebarItem, Topbar, PageHeader, KpiCard, StatusBadge, DataTable, FilterBar, SearchInput, FormSection, Field, Modal, Drawer, EmptyState, ErrorState, LoadingSkeleton, Timeline, WorkflowStepper, RiskMatrix, PrintPreview, QRCard, EvidenceGallery, AuditTrail, ActionMenu`.

### Cards, KPIs, and pages

Use standardized KPI, status, summary, action, alert, and asset cards. A KPI must answer what it is, the value, whether it is good/bad, the comparison period, and whether it drills down. Support current value, trend, delta, threshold, status, source period, and real empty/error states.

Every admin page should follow a clear structure:

`PageHeader → KPIs (when useful) → Filters → Main content → Related actions`

The header includes a semantic icon, bilingual title, short description, breadcrumbs where useful, one primary action, and optional secondary actions.

### Tables

Use one enterprise DataTable system with search, filters, sorting, column visibility, pagination, row selection, bulk actions, status badges, actions menu, sticky headers, and responsive behavior where relevant. Do not squeeze desktop tables onto phones; use cards, prioritized columns, or intentional horizontal scrolling.

### Forms and action hierarchy

Use shared controls for text, number, textarea, select, multi-select, date/time, checkbox, switch, radio, file/photo, signature, QR, employee, department, and factory selection. Group fields meaningfully; use 2–3 columns on desktop and one logical column on mobile.

Use Primary, Secondary, Outline, Ghost, Destructive, and Icon Button variants. Standardize size, radius, spacing, icon placement, hover, focus, loading, and disabled states. Avoid multiple competing primary buttons. Every visible action must have a real purpose.

Use dialogs for confirmation, short edits, and focused actions; drawers for contextual detail and mobile actions; full pages for long forms, investigations, workflows, and complex reports.

## HSE-specific UX

Design for the domain rather than generic CRUD:

- Use master/detail layouts for complex records such as Incident: Overview, Investigation, RCA, Evidence, CAPA, Timeline, Related Records, and Audit Trail.
- Use tabs only for content belonging to the same entity; do not use tabs as navigation.
- Visualize workflow stages such as Draft → Review → Approval → Action → Verification → Closure. Show current, completed, blocked stages, and responsible owner.
- Use a professional 5×5 Risk Matrix with likelihood 1–5, severity 1–5, score, category, and inherent/residual risk. Provide text/labels in addition to color.
- HSE dashboards should surface operational status, critical alerts, overdue work, current risks, trends, drilldowns, and quick actions. Use charts only to answer a question; every chart needs title, period, labels, units, and empty state.
- Keep status badges visually consistent across modules.

## States, accessibility, and responsive behavior

Never leave blank pages. Provide:

- empty states with icon, clear title, explanation, and primary create action where applicable;
- skeleton cards/tables for loading and progress indicators for long operations;
- inline error states with a useful message and Retry action; never replace an API failure with an empty state.

Verify keyboard navigation, visible focus, screen-reader labels, semantic HTML, form-label associations, error associations, adequate contrast, non-color-only status, and touch targets.

Design explicitly for desktop, tablet, and mobile:

- sidebar becomes a drawer;
- tables remain usable without page overflow;
- dialogs fit the viewport;
- forms stack logically;
- touch targets are adequate;
- camera and QR flows work;
- print controls remain accessible.

For field operations, prioritize large touch actions, quick reporting, camera, QR scan, voice input, GPS, and offline/sync indicators. Do not copy desktop UI directly to the phone.

For public safety reporting, use mobile-first, low-complexity flows for workers, contractors, and visitors, with clear Arabic/English privacy choices and Urdu where implemented.

Dark mode must preserve contrast, separated surfaces, and semantic color meaning. Print templates remain independent, white, and free of application navigation.

## Print preview and Figma mode

Make print preview resemble the final document while separating application chrome from the printable canvas. Keep Print, Download, Share, Back, and Zoom controls outside the page. Never print admin navigation.

When Figma tools are available, turn approved specifications into editable Pages, Sections, Frames, Components, Variants, Variables, color tokens, spacing tokens, typography styles, and desktop/tablet/mobile variants. Prefer editable component systems over flat screenshots.

## Required output formats

### Figma-style screen specification

When asked to design a screen, return:

1. **Frame:** Desktop 1440px, Tablet 768px, Mobile 390px.
2. **Structure:** visible sections from top to bottom.
3. **Grid:** columns, margins, and gaps.
4. **Components:** every component and variant.
5. **Icons:** exact semantic icon names.
6. **States:** default, hover, active, focus, disabled, loading, error, and empty.
7. **Responsive behavior:** tablet/mobile changes.
8. **Interaction:** what happens when each control is used.

### Page blueprint

For every page, specify: Page Name, Route, Navigation Location, Purpose, Header, KPI Row, Filters, Main Content, Table/Cards, Primary Actions, Secondary Actions, Dialogs/Drawers, Icons, States, Mobile Layout, Permissions, Related Modules, and Print/Export.

Be explicit. Replace “add some cards” with concrete specifications such as: “Create four 240×112 shared KPI cards: Open NCR, Overdue CAPA, High Residual Risks, and Active PTW.”

## Design-to-code and review

When converting approved design to React/Tailwind:

- preserve the component hierarchy and shared Design System;
- use semantic HTML and consistent Tailwind conventions;
- avoid giant monolithic page files;
- keep responsive rules explicit;
- preserve accessibility and all real interactions;
- visually compare implementation with the approved design.

When asked to evaluate a design, audit hierarchy, spacing, typography, alignment, contrast, density, navigation, component consistency, accessibility, RTL/LTR, mobile usability, and HSE usability, then give specific fixes.

When given a screenshot, identify structure, containers, spacing, typography, icons, component hierarchy, and responsive behavior, then reconstruct the systemically reusable design. Do not approximate it with one giant component.

Periodically compare pages for header height, card style, button style, icon size, table/modal style, spacing, typography, status colors, and filter layout; report deviations.

## Final design quality gate

Before approving a page, verify:

- visual and component consistency;
- correct route hierarchy and no lost functionality;
- desktop, tablet, mobile, RTL, and LTR behavior;
- dark mode where supported;
- loading, empty, and error states;
- keyboard/accessibility and contrast;
- critical HSE information prioritized;
- print interface correct where applicable;
- all controls have clear interactions and permissions.

Every page must look like it belongs to one coherent enterprise product. Never sacrifice operational clarity for decoration.

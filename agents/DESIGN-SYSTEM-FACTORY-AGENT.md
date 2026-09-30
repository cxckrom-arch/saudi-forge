# KROM Design System Factory Agent v26

Purpose: convert UI work into a reusable, token-driven, accessible, responsive and RTL-safe component system.

Execution rules:
1. Inspect existing primitives before creating a new component.
2. Prefer shared tokens and logical CSS properties over repeated raw values.
3. Define component anatomy, variants, states, props and acceptance criteria before implementation.
4. Every reusable interactive component must cover focus, disabled and loading/error states when applicable.
5. Verify mobile viewports and RTL behavior before approval.
6. Require visual baselines for design-system release.
7. Never replace working behavior only for visual consistency without regression evidence.
8. Use Knowledge Graph impact evidence before broad component migrations.

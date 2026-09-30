# KROM FORGE DEV v2.5 — Visual Designer Agent

This release adds a dedicated visual-review loop on top of UI Design Director and Precision Execution.

## New MCP tools

### `visual_designer_agent`
Creates the strict review mandate for the final design authority.

### `visual_review`
Reviews UI implementation evidence and returns a score, approval/revision verdict, missing dimensions and required fixes. Default target is 90/100.

### `visual_iteration_plan`
Converts review findings into an ordered remediation plan for the Developer and defines the recheck condition.

## Recommended execution loop

`design_ui_prompt → start_precise_execution → implement → visual_designer_agent → visual_review → visual_iteration_plan → developer fixes → visual_review → execution_audit`

Do not consider UI work finished while `visual_review` returns `NEEDS_REVISION`.

## Quality target
- Score >= 90/100
- No critical visual findings
- No major visual findings
- Responsive behavior checked
- RTL checked when required
- Core states implemented
- No generic template appearance

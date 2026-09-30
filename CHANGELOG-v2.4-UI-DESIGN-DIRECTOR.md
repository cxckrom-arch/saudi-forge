# v2.4 UI DESIGN DIRECTOR

## Added
- UI/UX Design Director prompt layer.
- `design_ui_prompt` MCP tool.
- `generate_design_system` MCP tool.
- `ui_design_quality_check` MCP tool.
- UI style presets: premium, industrial, minimal, glass, dashboard, mobile, editorial, futuristic.
- Density presets: compact, comfortable, spacious.
- Platform targets: web, mobile, desktop, responsive.
- Automatic UI Director injection into `build_prompt` for `ui` and `full` modes.
- UI fields in `prompt_from_project`.
- Strong anti-generic UI rules.
- Responsive, RTL, accessibility and interaction-state verification guidance.

## Verification
- TypeScript parser reported no syntax errors in the modified source.
- Full dependency-aware typecheck remains unavailable in the recovered compact package because MCP/Zod/Node type packages are not included.

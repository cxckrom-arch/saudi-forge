# KROM FORGE DEV — Prompt Studio v2.2

Prompt Studio turns KROM FORGE DEV into a reusable prompt-engineering MCP server for software work.

## 1. build_prompt

Use when you know the goal and want a production-grade implementation prompt.

Example input:

```json
{
  "goal": "Build an industrial HSE management platform with incidents, NCR, inspections and reports",
  "projectType": "HSE Platform",
  "mode": "full",
  "language": "bilingual",
  "autonomy": "autonomous",
  "stack": ["React", "TypeScript", "Supabase", "Vercel"],
  "requirements": [
    "Arabic RTL and English LTR",
    "Mobile responsive",
    "Role-based access control",
    "A4 report printing"
  ],
  "constraints": [
    "Preserve existing working features",
    "Do not expose service-role keys in frontend"
  ],
  "deliverables": [
    "Working implementation",
    "Database migrations",
    "Verification evidence"
  ],
  "includeVerification": true,
  "saveAs": "hse-platform-master"
}
```

## 2. improve_prompt

Use when the user gives a short or messy prompt.

Example:

```json
{
  "draft": "صلح صفحة التقارير وخلي الطباعة صفحة A4 ولا تخرب باقي المشروع",
  "mode": "fix",
  "language": "bilingual",
  "autonomy": "strong",
  "extraConstraints": [
    "Preserve the current report design system",
    "Verify mobile and print layout"
  ]
}
```

The tool preserves the original request and adds an execution contract, integrity rules and a verification gate.

## 3. prompt_from_project

Best tool for an existing repository. It reads:

- package.json
- package manager
- scripts
- root files
- detected React / Next.js / Vite / TypeScript / Electron / Supabase / Tailwind indicators

Then it creates a prompt grounded in the active `KROM_PROJECT_ROOT`.

Example:

```json
{
  "goal": "Fix the admin mobile navigation and remove route crashes",
  "mode": "fix",
  "language": "bilingual",
  "autonomy": "autonomous",
  "requirements": [
    "Test 375px, 390px and 430px widths",
    "Preserve desktop navigation"
  ]
}
```

## 4. prompt_quality_check

Returns a score from 0–100 and checks:

- Clear objective
- Project context
- Explicit requirements
- Constraints / safety
- Execution workflow
- Verification
- Definition of done

Suggested interpretation:

- 90–100: EXCELLENT
- 75–89: STRONG
- 55–74: NEEDS_IMPROVEMENT
- below 55: WEAK

## 5. prompt_library

Prompts are stored in:

```text
<KROM_PROJECT_ROOT>/.krom-prompts/
```

Actions:

- `list`
- `get`
- `save`
- `delete`

Example save:

```json
{
  "action": "save",
  "name": "mobile-fix-master",
  "content": "# prompt content..."
}
```

## Recommended Prompt Pipeline

```text
USER IDEA
   ↓
prompt_from_project / build_prompt
   ↓
prompt_quality_check
   ↓
improve_prompt (when needed)
   ↓
prompt_library save
   ↓
Execute with KROM development tools
   ↓
verification_gate
```

## Design principles

Prompt Studio is intentionally strict about:

- inspecting before editing;
- preserving working features;
- avoiding fake UI or fake success responses;
- resolving root causes rather than hiding errors;
- reporting skipped verification as SKIPPED instead of PASS;
- keeping secrets out of frontend code;
- providing implementation evidence before declaring completion.

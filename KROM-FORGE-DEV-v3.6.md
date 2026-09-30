# KROM FORGE DEV v3.6 — Self-Improving Engineering Memory

v3.6 adds evidence-backed engineering memory and confidence-aware execution.

## New tools

- `learning_memory_record` — stores proven successes/failures with evidence, tags, source, and confidence.
- `learning_memory_recall` — recalls relevant lessons by task type without replacing current-project inspection.
- `decision_confidence` — scores confidence 0–100 from context, evidence, risk, gaps, and prior outcomes.
- `adaptive_strategy_advisor` — combines Smart Context, runtime history, learned patterns, and confidence into the recommended next strategy.
- `learning_memory_status` — shows learning coverage, success/failure ratios, confidence, and recent lessons.

## Safety rules

- A successful learned pattern cannot be stored without evidence.
- Low-confidence lessons are advisory only.
- LOW decision confidence blocks broad or irreversible changes.
- Historical success never replaces current build/tests/browser verification.
- Repeated historical failures reduce confidence and influence agent routing.

## Persistent state

- `.krom/learning-memory.json`
- `.krom/decision-ledger.json`

## Recommended flow

Prompt → Smart Context → Learning Recall → Decision Confidence → Adaptive Strategy → Task Graph → Execution → Verification → Record Outcome/Lesson → Release Gate

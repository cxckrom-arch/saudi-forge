# Changelog v3.8

## Added
- Multi-Agent Engineering Council.
- Automatic council creation from Engineering Autopilot.
- Specialist role selection by task domain.
- Evidence-backed specialist opinions.
- Task-aware consensus scoring.
- High-confidence dissent protection.
- Conflict resolver that requests discriminating evidence instead of arbitrary voting.
- Persistent council state and history.
- Engineering Council Agent instructions.

## Safety / quality rules
- No consensus when required specialist opinions are missing.
- Evidence outranks preference.
- High-confidence risk dissent blocks broad execution.
- Council consensus never bypasses build, test, browser, visual, security, or release verification.

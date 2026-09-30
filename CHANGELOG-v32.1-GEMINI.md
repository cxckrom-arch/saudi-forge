# v32.1 Gemini integration
- Added `gemini` as a first-class provider kind.
- Added default `gemini-google` provider profile.
- Uses Google's OpenAI-compatible Gemini base URL.
- Added Gemini-aware `/models` discovery.
- Added `CONFIGURE-GEMINI.ps1`.
- Added `GEMINI_API_KEY` template entry.
- API key values remain environment-only and are never persisted by the provider profile layer.

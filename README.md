# 📌 College Notice Helper (PromptWars)

Paste, upload (PDF / image / text) a college notice. The AI extracts the event name, deadline,
date & time, venue/link and audience, then writes a one-line reminder.

**Live demo:** <PASTE YOUR VERCEL LINK HERE>

## How it works
Browser (index.html) -> `/api/extract` (Vercel serverless function) -> Gemini API -> structured JSON -> UI.
The API key lives only in a server environment variable.

## Prompt engineering (see `prompts/notice.js`)
- **Role + rules** in a system prompt (facts only, null when missing, no guessing)
- **Date grounding**: today's date + weekday injected on every call so "this Friday" resolves correctly
- **Few-shot examples** for a deadline notice and an event notice
- **Structured output**: JSON schema enforced via `responseSchema` (no fragile parsing)
- **Low temperature (0.1)** for consistent extraction
- **Prompt-injection defence**: notice is wrapped in `<notice>` tags and treated as data
- **Honesty fields**: `confidence` and `missing_info` shown to the student

## Setup
1. Get a free key at https://aistudio.google.com/app/apikey
2. Deploy on Vercel and add env var `GEMINI_API_KEY`
3. (Optional) `GEMINI_MODEL` to change the model (default `gemini-2.5-flash`)

## Structure
```
index.html          UI
api/extract.js      serverless function (calls the model)
prompts/notice.js   system prompt, user template, JSON schema
```

# 📌 College Notice Helper 

Paste or upload (PDF, PNG, JPG, WEBP, or `.txt`) a college notice. The AI extracts the event/assignment title, notice type, deadline, event date & time, venue, link, and target audience, then writes a friendly one-line reminder and highlights any missing details honestly.

**Live Demo:** [notice-helper-ai.vercel.app](https://notice-helper-ai.vercel.app/)

## How It Works
`Browser (index.html)` → `POST /api/extract` (Vercel Serverless Function in `api/extract.js`) → `Google Gemini API` → `Structured JSON` → `Safe DOM UI`.

- The Gemini API key is stored **exclusively** in a server-side environment variable (`GEMINI_API_KEY`) and is never exposed in browser code.
- Input validation enforces method checks (`POST` only), text length limits (max 8,000 characters), allowed file MIME types (`application/pdf`, `image/png`, `image/jpeg`, `image/webp`), valid base64 encoding, and decoded file size limits (max 3 MB).

## Project Structure
```text
.
├── index.html             # Frontend UI (single-page HTML/CSS/JS)
├── api/
│   └── extract.js         # Vercel serverless function (POST /api/extract)
├── prompts/
│   └── notice.js          # System prompt, user prompt builder, and JSON response schema
├── tests/
│   └── extract.test.js    # Automated unit & integration tests (mocked AI calls)
├── .env.example           # Example environment variable template (no real secrets)
├── .gitignore             # Excludes .env files, node_modules, .vercel, and OS logs
├── package.json           # Test script using Node's built-in test runner (zero dependencies)
└── README.md              # Documentation
```

## Prompt Engineering (`prompts/notice.js`)
- **Role + strict rules** in `SYSTEM_PROMPT`: facts only, `null` when missing, never invent dates/venues/audiences.
- **Date grounding**: injects today's date and weekday (`Asia/Kolkata`) on every request so relative dates like `"this Friday"` resolve accurately.
- **Few-shot examples**: demonstrates both deadline notices and event notices.
- **Structured output**: enforces `RESPONSE_SCHEMA` with `responseMimeType: "application/json"`.
- **Low temperature (`0.1`)**: keeps extraction factual and deterministic.
- **Prompt-injection defense**: wraps notice text in `<notice>...</notice>`, neutralizes any embedded `<notice>`/`</notice>` breakout tags, and instructs the model to treat the notice strictly as untrusted data.
- **Honesty fields**: surfaces `confidence` (`high` / `medium` / `low`) and `missing_info` in the UI.

## Local Setup & Testing

### Prerequisites
- **Node.js 18+** installed (`node -v`).

### 1. Clone the repository
```bash
git clone https://github.com/shreyagour2105/notice-helper-ai.git
cd notice-helper-ai
```

### 2. Run automated tests (no API key required)
The test suite uses Node's built-in test runner (`node --test`) and mocks all external Gemini API calls, so it runs offline and never makes paid API requests:
```bash
npm test
```

### 3. Run locally with Vercel CLI (optional)
To test the full app locally with a real Gemini API key:
1. Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```
2. Open `.env.local` and paste your key from [Google AI Studio](https://aistudio.google.com/app/apikey):
   ```ini
   GEMINI_API_KEY=your_actual_api_key_here
   ```
3. Start the local Vercel dev server:
   ```bash
   npx vercel dev
   ```

## Deploying to Vercel

1. Push this repository to GitHub (`main` branch).
2. Go to [vercel.com/new](https://vercel.com/new) and import your `shreyagour2105/notice-helper-ai` repository.
3. In the Vercel project setup (or under **Project Settings → Environment Variables**), add:
   - **`GEMINI_API_KEY`** *(Required)*: Your Google Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey). Select **Production**, **Preview**, and **Development** environments.
   - **`GEMINI_MODEL`** *(Optional)*: Leave unset to use the default `gemini-2.5-flash` configured in `api/extract.js`. Only set this if you want to override the model with another verified Gemini model ID that supports `generateContent` and `responseSchema`.
4. Click **Deploy** (or trigger a **Redeploy** under the **Deployments** tab if you added environment variables after the first deploy).
5. Open your live `.vercel.app` URL and test with the **Try a sample** button.

## Troubleshooting

- **"Server is missing GEMINI_API_KEY" (HTTP 500)**
  Make sure `GEMINI_API_KEY` is added in **Vercel → Project Settings → Environment Variables**, then redeploy the project so the new environment variable takes effect.
- **"404 Not Found" on `/api/extract`**
  Verify that `extract.js` is inside the `api/` folder (`api/extract.js`) and `notice.js` is inside the `prompts/` folder (`prompts/notice.js`).
- **"File too large (max 3 MB)" or "Unsupported file type"**
  Upload a PDF, PNG, JPG, WEBP, or `.txt` file under 3 MB, or paste the notice text directly (up to 8,000 characters).
- **"AI service error" / "Could not read the AI response" (HTTP 502)**
  Check that your `GEMINI_API_KEY` is valid and active in Google AI Studio and that your API quota has not been exceeded. If you set `GEMINI_MODEL`, remove it or verify that the model ID is valid.

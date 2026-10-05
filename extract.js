// Vercel serverless function: POST /api/extract
// Keeps the API key on the server (never in the browser).
const { SYSTEM_PROMPT, buildUserPrompt, RESPONSE_SCHEMA } = require("../prompts/notice");

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const MAX_TEXT = 8000; // characters

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: "Server is missing GEMINI_API_KEY" });

  const { text = "", file } = req.body || {};
  if (!text.trim() && !file) return res.status(400).json({ error: "Please provide notice text or a file." });
  if (text.length > MAX_TEXT) return res.status(400).json({ error: `Notice too long (max ${MAX_TEXT} characters).` });

  // Today's date in India, so "this Friday" is resolved correctly
  const now = new Date();
  const todayISO = now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const weekday = now.toLocaleDateString("en-US", { timeZone: "Asia/Kolkata", weekday: "long" });

  const parts = [{ text: buildUserPrompt(text.trim(), todayISO, weekday) }];
  if (file && file.data && file.mimeType) {
    parts.push({ inline_data: { mime_type: file.mimeType, data: file.data } });
  }

  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts }],
        generationConfig: {
          temperature: 0.1, // low = consistent, factual extraction
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
    });
    const data = await r.json();
    if (!r.ok) return res.status(502).json({ error: data.error?.message || "AI service error" });

    const raw = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
    return res.status(200).json(JSON.parse(raw));
  } catch (err) {
    return res.status(500).json({ error: "Could not read the AI response. Please try again." });
  }
};

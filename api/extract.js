// Vercel serverless function: POST /api/extract
// Keeps the API key on the server (never in the browser).
const { SYSTEM_PROMPT, buildUserPrompt, RESPONSE_SCHEMA } = require("../prompts/notice");

const DEFAULT_MODEL = "gemini-3.8-flash";
const MAX_TEXT = 8000; // characters
const MAX_FILE_BYTES = 3 * 1024 * 1024; // 3 MB
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
]);
const VALID_TYPES = new Set([
  "assignment",
  "exam",
  "event",
  "workshop",
  "registration",
  "holiday",
  "other",
]);
const VALID_CONFIDENCE = new Set(["high", "medium", "low"]);
const BASE64_REGEX = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function normalizeDateTime(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  const date = typeof obj.date === "string" ? obj.date.trim() : "";
  if (!date) return null;
  const time = typeof obj.time === "string" && obj.time.trim() ? obj.time.trim() : null;
  return { date, time };
}

function normalizeExtractedNotice(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  if (typeof parsed.title !== "string" || !parsed.title.trim()) return null;
  if (typeof parsed.reminder !== "string" || !parsed.reminder.trim()) return null;

  const type = typeof parsed.type === "string" && VALID_TYPES.has(parsed.type.trim().toLowerCase())
    ? parsed.type.trim().toLowerCase()
    : "other";

  const confidence = typeof parsed.confidence === "string" && VALID_CONFIDENCE.has(parsed.confidence.trim().toLowerCase())
    ? parsed.confidence.trim().toLowerCase()
    : "low";

  const otherDates = Array.isArray(parsed.other_dates)
    ? parsed.other_dates
        .filter((d) => d && typeof d === "object" && !Array.isArray(d) && typeof d.date === "string" && d.date.trim())
        .map((d) => ({
          label: typeof d.label === "string" && d.label.trim() ? d.label.trim() : "Other date",
          date: d.date.trim(),
          time: typeof d.time === "string" && d.time.trim() ? d.time.trim() : null,
        }))
    : [];

  const missingInfo = Array.isArray(parsed.missing_info)
    ? parsed.missing_info
        .filter((m) => typeof m === "string" && m.trim())
        .map((m) => m.trim())
    : [];

  return {
    title: parsed.title.trim(),
    type,
    deadline: normalizeDateTime(parsed.deadline),
    event: normalizeDateTime(parsed.event),
    venue: typeof parsed.venue === "string" && parsed.venue.trim() ? parsed.venue.trim() : null,
    link: typeof parsed.link === "string" && parsed.link.trim() ? parsed.link.trim() : null,
    audience: typeof parsed.audience === "string" && parsed.audience.trim() ? parsed.audience.trim() : null,
    other_dates: otherDates,
    reminder: parsed.reminder.trim(),
    confidence,
    missing_info: missingInfo,
  };
}

module.exports = async function handler(req, res) {
  if (!req || req.method !== "POST") {
    if (res && typeof res.setHeader === "function") {
      res.setHeader("Allow", "POST");
    }
    return res.status(405).json({ error: "Use POST" });
  }

  const key = (process.env.GEMINI_API_KEY || "").trim();
  if (!key) return res.status(500).json({ error: "Server is missing GEMINI_API_KEY" });

  const model = (process.env.GEMINI_MODEL || DEFAULT_MODEL).trim();
  if (!/^[a-zA-Z0-9._-]+$/.test(model)) {
    return res.status(500).json({ error: "Invalid GEMINI_MODEL configuration" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = body.trim() ? JSON.parse(body) : {};
    } catch {
      return res.status(400).json({ error: "Invalid JSON request body." });
    }
  }
  if (body !== undefined && body !== null && (typeof body !== "object" || Array.isArray(body))) {
    return res.status(400).json({ error: "Invalid request body." });
  }

  const { text = "", file } = body || {};
  if (text !== undefined && text !== null && typeof text !== "string") {
    return res.status(400).json({ error: "Notice text must be a string." });
  }

  const rawText = typeof text === "string" ? text : "";
  const trimmedText = rawText.trim();
  const hasFile = file !== undefined && file !== null;

  if (!trimmedText && !hasFile) {
    return res.status(400).json({ error: "Please provide notice text or a file." });
  }
  if (rawText.length > MAX_TEXT) {
    return res.status(400).json({ error: `Notice too long (max ${MAX_TEXT} characters).` });
  }

  let validatedFile = null;
  if (hasFile) {
    if (typeof file !== "object" || Array.isArray(file)) {
      return res.status(400).json({ error: "Invalid file attachment." });
    }
    const mimeType = typeof file.mimeType === "string" ? file.mimeType.trim().toLowerCase() : "";
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return res.status(400).json({ error: "Unsupported file type. Allowed types: PDF, PNG, JPEG, WEBP." });
    }
    if (typeof file.data !== "string" || !file.data.trim()) {
      return res.status(400).json({ error: "File data is missing or invalid." });
    }
    const cleanB64 = file.data.replace(/\s+/g, "");
    if (!cleanB64 || cleanB64.length % 4 !== 0 || !BASE64_REGEX.test(cleanB64)) {
      return res.status(400).json({ error: "Malformed base64 file data." });
    }
    const decoded = Buffer.from(cleanB64, "base64");
    if (!decoded.length || decoded.toString("base64") !== cleanB64) {
      return res.status(400).json({ error: "Malformed base64 file data." });
    }
    if (decoded.length > MAX_FILE_BYTES) {
      return res.status(400).json({ error: "File too large (max 3 MB)." });
    }
    validatedFile = { mimeType, data: cleanB64 };
  }

  // Today's date in India, so "this Friday" is resolved correctly
  const now = new Date();
  const todayISO = now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const weekday = now.toLocaleDateString("en-US", { timeZone: "Asia/Kolkata", weekday: "long" });

  const parts = [{ text: buildUserPrompt(trimmedText, todayISO, weekday) }];
  if (validatedFile) {
    parts.push({ inline_data: { mime_type: validatedFile.mimeType, data: validatedFile.data } });
  }

  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
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

    let data = null;
    try {
      data = await r.json();
    } catch {
      return res.status(502).json({ error: "AI service returned an invalid response." });
    }

    if (!r.ok) {
      const rawMessage = typeof data?.error?.message === "string" && data.error.message.trim()
        ? data.error.message.trim()
        : "AI service error";
      const safeMessage = rawMessage.split(key).join("[REDACTED]");
      return res.status(502).json({ error: safeMessage });
    }

    const raw = (data?.candidates?.[0]?.content?.parts || [])
      .map((p) => (typeof p?.text === "string" ? p.text : ""))
      .join("")
      .trim();

    if (!raw) {
      return res.status(502).json({ error: "AI returned an empty response. Please try again." });
    }

    const parsed = JSON.parse(raw);
    const normalized = normalizeExtractedNotice(parsed);
    if (!normalized) {
      return res.status(502).json({ error: "Could not read the AI response. Please try again." });
    }

    return res.status(200).json(normalized);
  } catch {
    return res.status(500).json({ error: "Could not read the AI response. Please try again." });
  }
};


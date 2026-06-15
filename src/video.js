import { readFileSync, statSync } from 'fs';

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const KEY = process.env.GEMINI_API_KEY;

const PROMPT = `You are a senior performance-marketing strategist analysing a competitor's video ad.
Watch the FULL video — both the visuals AND the audio/voiceover — and return ONLY a JSON object with these exact keys:
{
  "summary": "one-sentence what-happens",
  "format": "e.g. UGC try-on, talking-head, product demo, lifestyle, founder-story",
  "on_screen_talent": "who appears (creator/model/founder), how many people",
  "setting": "where it's shot",
  "hook": "the exact opening hook (first 3 seconds), text or spoken",
  "hook_type": "e.g. objection-handling, pattern-interrupt, social-proof, problem-agitate, price",
  "voiceover_transcript": "full spoken transcript, or null if no voiceover",
  "onscreen_text": ["list of on-screen captions in order"],
  "beats": [{"t": "0-3s", "what": "description of this beat"}],
  "music": "describe the music/audio vibe, or null",
  "emotional_tone": "e.g. aspirational, playful, urgent, relatable",
  "offer": "any offer/discount mentioned",
  "price_points": ["any prices shown/said"],
  "cta": "the call to action",
  "target_audience": "who this is aimed at",
  "why_it_works": "2-3 sentences on the persuasion strategy and why it likely performs"
}
Return strictly valid JSON, no markdown fences.`;

// Verbatim script + shot-by-shot + hook — used for alert emails.
export const SCRIPT_PROMPT = `Analyse this competitor video ad as a performance strategist. Return ONLY valid JSON (no markdown fences):
{
 "hook": "the EXACT opening hook — first 3 seconds, spoken and/or on-screen, verbatim",
 "hook_type": "objection-handling | pattern-interrupt | celebrity | curiosity | problem-agitate | price",
 "summary": "one sentence",
 "format": "e.g. UGC try-on, talking-head",
 "music": "describe or null",
 "total_duration_s": number,
 "timeline": [{"t":"0.0-2.0","voiceover_verbatim":"exact words, keep Hinglish as said, or null","onscreen_text_verbatim":"exact caption or null","visual":"shot description"}]
}
Be literal; the hook field is the most important — get it exactly right.`;

export async function analyzeVideo(filePath, opts = {}) {
  const sizeMB = statSync(filePath).size / 1e6;
  if (sizeMB > 18) throw new Error(`Video ${sizeMB.toFixed(1)}MB too large for inline upload; use File API`);
  return analyzeVideoBuffer(readFileSync(filePath), opts);
}

export async function analyzeVideoBuffer(buffer, { model = MODEL, prompt = PROMPT } = {}) {
  if (!KEY) throw new Error('GEMINI_API_KEY not set');
  const bytes = buffer;

  const body = {
    contents: [{
      parts: [
        { inline_data: { mime_type: 'video/mp4', data: bytes.toString('base64') } },
        { text: prompt },
      ],
    }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.4 },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gemini ${res.status}: ${t.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  let analysis;
  try { analysis = JSON.parse(text); }
  catch { analysis = { _parseError: true, raw: text }; }

  return { analysis, usage: data.usageMetadata || null, model };
}

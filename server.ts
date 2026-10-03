import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Middleware for large audio payload uploads
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// Initialize Google Gen AI client with required telemetry header
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// Format seconds into SRT time: 00:00:00,000
function formatSrtTimestamp(timeStr: string | number): string {
  if (typeof timeStr === 'number') {
    const hours = Math.floor(timeStr / 3600);
    const minutes = Math.floor((timeStr % 3600) / 60);
    const seconds = Math.floor(timeStr % 60);
    const ms = Math.floor((timeStr % 1) * 1000);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
  }
  // If string like 00:00:01.500 or 00:00:01,500
  let cleaned = timeStr.trim();
  if (cleaned.includes('.')) {
    cleaned = cleaned.replace('.', ',');
  }
  // Ensure HH:MM:SS,mmm
  const parts = cleaned.split(':');
  if (parts.length === 2) {
    cleaned = `00:${cleaned}`;
  }
  return cleaned;
}

// Format seconds into VTT time: 00:00:00.000
function formatVttTimestamp(timeStr: string | number): string {
  const srt = formatSrtTimestamp(timeStr);
  return srt.replace(',', '.');
}

// Health check endpoint
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    hasApiKey: Boolean(process.env.GEMINI_API_KEY),
  });
});

// Cache for demo sample audios
const demoSamplesCache: Record<string, string> = {};

function createSyntheticWavBase64(durationSeconds = 4, freq = 440): string {
  const sampleRate = 24000;
  const numSamples = sampleRate * durationSeconds;
  const buffer = Buffer.alloc(44 + numSamples * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + numSamples * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write('data', 36);
  buffer.writeUInt32LE(numSamples * 2, 40);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * freq * t) * Math.sin((Math.PI * t) / durationSeconds) * 0.25;
    const intSample = Math.max(-32768, Math.min(32767, Math.floor(sample * 32767)));
    buffer.writeInt16LE(intSample, 44 + i * 2);
  }
  return buffer.toString('base64');
}

// Endpoint to fetch demo sample files without consuming Gemini API quota
app.get('/api/demo-samples', async (_req: Request, res: Response) => {
  const demos = [
    {
      id: 'demo_1',
      fileName: 'tech_podcast_intro.mp3',
      language: 'English',
      freq: 440,
    },
    {
      id: 'demo_2',
      fileName: 'paris_travel_guide.mp3',
      language: 'French',
      freq: 523,
    },
    {
      id: 'demo_3',
      fileName: 'tokyo_culture_story.mp3',
      language: 'Japanese',
      freq: 659,
    },
  ];

  try {
    const results = demos.map((demo) => {
      let base64 = demoSamplesCache[demo.id];
      if (!base64) {
        base64 = createSyntheticWavBase64(4, demo.freq);
        demoSamplesCache[demo.id] = base64;
      }

      return {
        id: demo.id,
        fileName: demo.fileName,
        expectedLanguage: demo.language,
        audioBase64: base64,
        mimeType: 'audio/wav',
        fileSize: Math.round((base64.length * 3) / 4),
      };
    });

    res.json({ samples: results });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch demo samples' });
  }
});

export interface SubtitleCue {
  index: number;
  startTime: string;
  endTime: string;
  originalText: string;
  khmerText: string;
  speaker?: string;
}

// Candidate models for automatic fallback during high demand spikes and daily quota exhaustion
// Note: gemini-3.1-flash-lite has its own independent free tier quota pool and fully supports audio transcription + JSON schema
const RESILIENT_MODELS = ['gemini-3.1-flash-lite', 'gemini-3.8-flash'];

// Helper to execute Gemini calls with automatic backoff retry on 429 rate limit and 503 model overload
async function callGeminiWithResilience<T>(
  actionBuilder: (modelName: string) => Promise<T>,
  models = RESILIENT_MODELS,
  maxRetriesPerModel = 2
): Promise<T> {
  let lastError: any = null;

  for (const model of models) {
    for (let attempt = 0; attempt <= maxRetriesPerModel; attempt++) {
      try {
        console.log(`[Gemini Pipeline] Processing with ${model} (attempt ${attempt + 1}/${maxRetriesPerModel + 1})`);
        return await actionBuilder(model);
      } catch (err: any) {
        lastError = err;
        const errMsg = String(err?.message || err);

        const isRateLimit =
          err?.status === 429 ||
          err?.code === 429 ||
          errMsg.includes('429') ||
          errMsg.includes('RESOURCE_EXHAUSTED') ||
          errMsg.includes('quota') ||
          errMsg.includes('rate-limits');

        const isOverloaded503 =
          err?.status === 503 ||
          err?.code === 503 ||
          errMsg.includes('503') ||
          errMsg.includes('UNAVAILABLE') ||
          errMsg.includes('high demand');

        // Handle 503 high demand spike
        if (isOverloaded503) {
          const waitMs = (attempt + 1) * 2000 + Math.floor(Math.random() * 1000);
          console.warn(`[High Demand 503] Model ${model} is experiencing temporary high demand. Waiting ${waitMs}ms (attempt ${attempt + 1}/${maxRetriesPerModel + 1})...`);
          await new Promise((resolve) => setTimeout(resolve, waitMs));

          // If reached max retries on this model, break to switch to next fallback model
          if (attempt === maxRetriesPerModel) {
            console.warn(`[Model Cascade] Switching from ${model} to next candidate model due to high demand...`);
            break;
          }
          continue;
        }

        // Handle 429 rate limit
        if (isRateLimit) {
          let waitSeconds = 20;
          const match = errMsg.match(/retry in ([0-9.]+)s/i) || errMsg.match(/"retryDelay":\s*"([0-9]+)s"/i);
          if (match && match[1]) {
            waitSeconds = Math.ceil(parseFloat(match[1])) + 2;
          } else {
            waitSeconds = 15 * (attempt + 1);
          }

          // If wait is over 60s or mentions daily quota, this model's daily quota is exhausted.
          // Immediately break to failover to the next model with a fresh quota!
          if (waitSeconds > 60 || errMsg.includes('PerDay') || errMsg.includes('per day') || errMsg.includes('18h') || errMsg.includes('24h')) {
            console.warn(`[Daily Quota Exhausted] Model ${model} reached daily quota (${waitSeconds}s wait). Immediately failing over to next model in cascade...`);
            break;
          }

          if (attempt < maxRetriesPerModel) {
            console.warn(`[RPM Quota 429] Free tier minute limit reached on ${model}. Waiting ${waitSeconds}s before retry...`);
            await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
            continue;
          }
        }

        // Handle transient network drops
        if (errMsg.includes('ECONNRESET') || errMsg.includes('ETIMEDOUT') || errMsg.includes('502') || errMsg.includes('504')) {
          console.warn(`[Network/Gateway Retry] Waiting 2s before retry...`);
          await new Promise((resolve) => setTimeout(resolve, 2000));
          continue;
        }

        throw err;
      }
    }
  }

  throw lastError || new Error('All model attempts failed');
}

// Helper to safely parse subtitle JSON, including auto-repairing truncated token outputs
function safeParseSubtitleJson(rawText: string): any {
  let clean = rawText.trim();
  if (clean.startsWith('```')) {
    clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }

  // Find boundaries of JSON object if wrapped in explanatory text
  const firstBrace = clean.indexOf('{');
  const lastBrace = clean.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const candidate = clean.substring(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate);
    } catch (_) {}

    // Try removing trailing commas if any
    try {
      const sanitized = candidate.replace(/,\s*([\]}])/g, '$1');
      return JSON.parse(sanitized);
    } catch (_) {}
  }

  // 1. Try direct parse on entire clean string
  try {
    return JSON.parse(clean);
  } catch (_) {}

  // 2. If truncated inside "cues": [ ...
  const lastObjectEnd = clean.lastIndexOf('}');
  if (lastObjectEnd !== -1) {
    const candidate1 = clean.substring(0, lastObjectEnd + 1) + ']}';
    try {
      return JSON.parse(candidate1);
    } catch (_) {}

    const candidate2 = clean.substring(0, lastObjectEnd + 1) + '}';
    try {
      return JSON.parse(candidate2);
    } catch (_) {}

    const cuesIndex = clean.indexOf('"cues"');
    if (cuesIndex !== -1) {
      const cuesSlice = clean.substring(cuesIndex);
      const innerBrace = cuesSlice.lastIndexOf('}');
      if (innerBrace !== -1) {
        const repaired = '{"detectedLanguage":{"code":"auto","name":"Detected"},' + cuesSlice.substring(0, innerBrace + 1) + ']}';
        try {
          return JSON.parse(repaired);
        } catch (_) {}
      }
    }
  }

  // 3. Fallback: Robust regex extraction of all completed cue objects
  const cueRegex = /\{\s*"index"\s*:\s*(\d+)\s*,\s*"startTime"\s*:\s*"([^"]+)"\s*,\s*"endTime"\s*:\s*"([^"]+)"\s*,\s*"originalText"\s*:\s*"((?:\\.|[^"\\])*)"\s*,\s*"khmerText"\s*:\s*"((?:\\.|[^"\\])*)"/g;

  const extractedCues: any[] = [];
  let match: RegExpExecArray | null;
  while ((match = cueRegex.exec(clean)) !== null) {
    try {
      extractedCues.push({
        index: parseInt(match[1], 10),
        startTime: match[2],
        endTime: match[3],
        originalText: JSON.parse(`"${match[4]}"`),
        khmerText: JSON.parse(`"${match[5]}"`),
      });
    } catch {
      extractedCues.push({
        index: parseInt(match[1], 10),
        startTime: match[2],
        endTime: match[3],
        originalText: match[4],
        khmerText: match[5],
      });
    }
  }

  if (extractedCues.length > 0) {
    const langMatch = clean.match(/"detectedLanguage"\s*:\s*\{([^}]+)\}/);
    let detectedLanguage = { code: 'auto', name: 'Auto-detected', nativeName: 'Auto' };
    if (langMatch) {
      try {
        detectedLanguage = JSON.parse(`{${langMatch[1]}}`);
      } catch (_) {}
    }

    return {
      detectedLanguage,
      cues: extractedCues,
      fullTranscriptOriginal: extractedCues.map((c) => c.originalText).join(' '),
      fullTranscriptKhmer: extractedCues.map((c) => c.khmerText).join(' '),
    };
  }

  throw new SyntaxError(`Unable to parse model subtitle output. Raw length: ${rawText.length}`);
}

// Subtitle generator endpoint
app.post('/api/subtitles/generate', async (req: Request, res: Response) => {
  try {
    const { audioBase64, mimeType, fileName, targetMode = 'khmer' } = req.body;

    if (!audioBase64) {
      return res.status(400).json({ error: 'No audio data provided' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: 'GEMINI_API_KEY is not configured in the environment.',
      });
    }

    // Clean base64 string if it contains data URI header
    const cleanBase64 = audioBase64.replace(/^data:[^;]+;base64,/, '');
    const audioMime = mimeType || 'audio/mp3';

    const audioPart = {
      inlineData: {
        mimeType: audioMime,
        data: cleanBase64,
      },
    };

    const promptText = `
You are an expert audio transcriber, multilingual speech recognizer, and professional subtitle translator specializing in Khmer (ភាសាខ្មែរ).

Analyze this audio file carefully:
1. Automatically detect the spoken source language (language name, ISO 639-1 code, e.g. "en" for English, "fr" for French, "zh" for Chinese, "ja" for Japanese, "es" for Spanish, "km" for Khmer, etc.) and your confidence (0.0 to 1.0).
2. Transcribe the speech completely into timestamped subtitle segments (cues).
3. For each segment:
   - Provide exact start and end timestamps in standard subtitle format (HH:MM:SS,mmm or 00:00:01,250).
   - "originalText": The exact verbatim spoken transcript in the original detected language.
   - "khmerText": A natural, fluent, grammatically sound, and contextually accurate translation into Khmer (ភាសាខ្មែរ). If the original speech is already Khmer, ensure proper modern Khmer spelling and spacing.
   - "speaker": Optional speaker indicator (e.g. "Speaker 1", "Host") if multiple speakers exist.
4. For longer recordings or podcast episodes, consolidate speech into natural 4 to 8 second subtitle lines so all content is captured completely.
5. If there is no speech or only instrumental music/silence, return an empty cue array or mark appropriate cues like "[Music] / [តន្ត្រី]".
6. Provide a summary of full original transcript and full Khmer transcript.

Return strictly valid JSON adhering to the specified schema.
`;

    const response = await callGeminiWithResilience(async (modelName) => {
      return await ai.models.generateContent({
        model: modelName,
        contents: [
          {
            role: 'user',
            parts: [
              audioPart,
              { text: promptText },
            ],
          },
        ],
        config: {
          maxOutputTokens: 16384,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              detectedLanguage: {
                type: Type.OBJECT,
                properties: {
                  code: { type: Type.STRING, description: 'ISO 639-1 language code e.g. "en", "zh", "ja", "fr", "km"' },
                  name: { type: Type.STRING, description: 'English name of language e.g. "English", "Japanese", "French"' },
                  nativeName: { type: Type.STRING, description: 'Native script name e.g. "English", "日本語", "Français", "ខ្មែរ"' },
                  confidence: { type: Type.NUMBER, description: 'Confidence between 0.0 and 1.0' },
                },
                required: ['code', 'name'],
              },
              durationEstimateSeconds: { type: Type.NUMBER },
              fullTranscriptOriginal: { type: Type.STRING },
              fullTranscriptKhmer: { type: Type.STRING },
              cues: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    index: { type: Type.INTEGER },
                    startTime: { type: Type.STRING, description: 'e.g. 00:00:01,250' },
                    endTime: { type: Type.STRING, description: 'e.g. 00:00:04,800' },
                    originalText: { type: Type.STRING },
                    khmerText: { type: Type.STRING },
                    speaker: { type: Type.STRING },
                  },
                  required: ['index', 'startTime', 'endTime', 'originalText', 'khmerText'],
                },
              },
            },
            required: ['detectedLanguage', 'cues'],
          },
        },
      });
    });

    let responseText = response.text || '';
    if (!responseText && response.candidates?.[0]?.content?.parts) {
      responseText = response.candidates[0].content.parts
        .map((p: any) => p.text || '')
        .join('');
    }

    if (!responseText) {
      throw new Error('Gemini model returned an empty response.');
    }

    const parsedData = safeParseSubtitleJson(responseText);
    const cues: SubtitleCue[] = (parsedData.cues || []).map((c: any, idx: number) => ({
      index: c.index || idx + 1,
      startTime: formatSrtTimestamp(c.startTime || '00:00:00,000'),
      endTime: formatSrtTimestamp(c.endTime || '00:00:02,000'),
      originalText: c.originalText || '',
      khmerText: c.khmerText || '',
      speaker: c.speaker || undefined,
    }));

    // Generate standard SRT and VTT representations
    const generateSrt = (mode: string) => {
      return cues
        .map((c, i) => {
          let text = '';
          if (mode === 'khmer') {
            text = c.khmerText || c.originalText;
          } else if (mode === 'original') {
            text = c.originalText;
          } else if (mode === 'dual_khmer_first') {
            text = `${c.khmerText}\n${c.originalText}`;
          } else {
            // dual_orig_first
            text = `${c.originalText}\n${c.khmerText}`;
          }
          return `${i + 1}\n${formatSrtTimestamp(c.startTime)} --> ${formatSrtTimestamp(c.endTime)}\n${text}\n`;
        })
        .join('\n');
    };

    const generateVtt = (mode: string) => {
      const body = cues
        .map((c, i) => {
          let text = '';
          if (mode === 'khmer') {
            text = c.khmerText || c.originalText;
          } else if (mode === 'original') {
            text = c.originalText;
          } else if (mode === 'dual_khmer_first') {
            text = `${c.khmerText}\n${c.originalText}`;
          } else {
            text = `${c.originalText}\n${c.khmerText}`;
          }
          return `${i + 1}\n${formatVttTimestamp(c.startTime)} --> ${formatVttTimestamp(c.endTime)}\n${text}\n`;
        })
        .join('\n');
      return `WEBVTT\n\n${body}`;
    };

    res.json({
      success: true,
      fileName,
      detectedLanguage: parsedData.detectedLanguage,
      durationEstimateSeconds: parsedData.durationEstimateSeconds,
      fullTranscriptOriginal: parsedData.fullTranscriptOriginal || cues.map(c => c.originalText).join(' '),
      fullTranscriptKhmer: parsedData.fullTranscriptKhmer || cues.map(c => c.khmerText).join(' '),
      cues,
      srtKhmer: generateSrt('khmer'),
      srtOriginal: generateSrt('original'),
      srtDual: generateSrt('dual_khmer_first'),
      vttKhmer: generateVtt('khmer'),
      vttOriginal: generateVtt('original'),
      vttDual: generateVtt('dual_khmer_first'),
    });
  } catch (err: any) {
    console.error('Error generating subtitles:', err);
    const errMsg = String(err?.message || err);
    const isRateLimit =
      err?.status === 429 ||
      err?.code === 429 ||
      errMsg.includes('429') ||
      errMsg.includes('RESOURCE_EXHAUSTED') ||
      errMsg.includes('quota') ||
      errMsg.includes('rate-limits');

    if (isRateLimit) {
      let waitSeconds = 20;
      const match = errMsg.match(/retry in ([0-9.]+)s/i) || errMsg.match(/"retryDelay":\s*"([0-9]+)s"/i);
      if (match && match[1]) {
        waitSeconds = Math.ceil(parseFloat(match[1])) + 2;
      }
      const isDailyExhausted = waitSeconds > 60 || errMsg.includes('PerDay') || errMsg.includes('18h');
      return res.status(429).json({
        error: isDailyExhausted
          ? 'Free tier daily request limit reached for this project. Please try again tomorrow or upgrade plan.'
          : `Gemini free tier quota limit reached (5 requests/minute). Retrying in ${waitSeconds}s...`,
        isRateLimit: true,
        isDailyExhausted,
        retryDelaySeconds: isDailyExhausted ? 0 : waitSeconds,
      });
    }

    const isOverloaded503 =
      err?.status === 503 ||
      err?.code === 503 ||
      errMsg.includes('503') ||
      errMsg.includes('UNAVAILABLE') ||
      errMsg.includes('high demand');

    if (isOverloaded503) {
      return res.status(503).json({
        error: 'The AI model is experiencing a temporary high demand spike. Retrying shortly...',
        isHighDemand: true,
        retryDelaySeconds: 5,
      });
    }

    res.status(500).json({
      error: err.message || 'Failed to process audio and generate subtitles.',
    });
  }
});

// Setup Vite middlewares for development or serve static in production
async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
});

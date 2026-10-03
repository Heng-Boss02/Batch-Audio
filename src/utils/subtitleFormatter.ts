import JSZip from 'jszip';
import { AudioFileItem, ExportFormat, SubtitleCue, TargetLanguageMode } from '../types';

/**
 * Derives the subtitle file name from the audio file name.
 * Rule: Subtitle file name must match the audio file name exactly,
 * replacing the audio extension with the subtitle extension (.srt, .vtt, etc.).
 *
 * Examples:
 *   "interview_part1.mp3", "srt" -> "interview_part1.srt"
 *   "voice.notes.2026.wav", "vtt" -> "voice.notes.2026.vtt"
 *   "lesson_khmer.m4a", "txt" -> "lesson_khmer.txt"
 */
export function getSubtitleFileName(audioFileName: string, format: ExportFormat): string {
  // Strip path if present
  const baseOnly = audioFileName.replace(/^.*[\\/]/, '');
  const lastDot = baseOnly.lastIndexOf('.');
  const baseName = lastDot > 0 ? baseOnly.substring(0, lastDot) : baseOnly;
  return `${baseName}.${format}`;
}

/**
 * Format timestamp to SRT standard: HH:MM:SS,mmm
 */
export function formatToSrtTime(timeStr: string): string {
  let cleaned = timeStr.trim();
  if (cleaned.includes('.')) {
    cleaned = cleaned.replace('.', ',');
  }
  const parts = cleaned.split(':');
  if (parts.length === 2) {
    cleaned = `00:${cleaned}`;
  }
  return cleaned;
}

/**
 * Format timestamp to WebVTT standard: HH:MM:SS.mmm
 */
export function formatToVttTime(timeStr: string): string {
  return formatToSrtTime(timeStr).replace(',', '.');
}

/**
 * Convert cues into SRT format string
 */
export function formatCuesToSrt(cues: SubtitleCue[], mode: TargetLanguageMode): string {
  if (!cues || cues.length === 0) return '';
  return cues
    .map((cue, idx) => {
      let text = '';
      if (mode === 'khmer') {
        text = cue.khmerText || cue.originalText;
      } else if (mode === 'original') {
        text = cue.originalText;
      } else if (mode === 'dual_khmer_first') {
        text = `${cue.khmerText}\n${cue.originalText}`;
      } else {
        // dual_orig_first
        text = `${cue.originalText}\n${cue.khmerText}`;
      }
      return `${idx + 1}\n${formatToSrtTime(cue.startTime)} --> ${formatToSrtTime(cue.endTime)}\n${text.trim()}\n`;
    })
    .join('\n');
}

/**
 * Convert cues into WebVTT format string
 */
export function formatCuesToVtt(cues: SubtitleCue[], mode: TargetLanguageMode): string {
  if (!cues || cues.length === 0) return 'WEBVTT\n';
  const body = cues
    .map((cue, idx) => {
      let text = '';
      if (mode === 'khmer') {
        text = cue.khmerText || cue.originalText;
      } else if (mode === 'original') {
        text = cue.originalText;
      } else if (mode === 'dual_khmer_first') {
        text = `${cue.khmerText}\n${cue.originalText}`;
      } else {
        text = `${cue.originalText}\n${cue.khmerText}`;
      }
      return `${idx + 1}\n${formatToVttTime(cue.startTime)} --> ${formatToVttTime(cue.endTime)}\n${text.trim()}\n`;
    })
    .join('\n');
  return `WEBVTT\n\n${body}`;
}

/**
 * Convert cues into plain text transcript
 */
export function formatCuesToTxt(cues: SubtitleCue[], mode: TargetLanguageMode): string {
  if (!cues || cues.length === 0) return '';
  return cues
    .map((cue) => {
      if (mode === 'khmer') {
        return `[${cue.startTime} - ${cue.endTime}] ${cue.khmerText}`;
      } else if (mode === 'original') {
        return `[${cue.startTime} - ${cue.endTime}] ${cue.originalText}`;
      } else {
        return `[${cue.startTime} - ${cue.endTime}]\nKhmer: ${cue.khmerText}\nOriginal: ${cue.originalText}\n`;
      }
    })
    .join('\n\n');
}

/**
 * Convert subtitle item into structured JSON
 */
export function formatCuesToJson(item: AudioFileItem, mode: TargetLanguageMode): string {
  return JSON.stringify(
    {
      sourceAudioFileName: item.fileName,
      detectedLanguage: item.detectedLanguage,
      targetLanguageMode: mode,
      exportedAt: new Date().toISOString(),
      cuesCount: item.cues.length,
      cues: item.cues.map((c) => ({
        index: c.index,
        startTime: c.startTime,
        endTime: c.endTime,
        originalText: c.originalText,
        khmerText: c.khmerText,
        speaker: c.speaker,
      })),
      fullTranscriptOriginal: item.fullTranscriptOriginal,
      fullTranscriptKhmer: item.fullTranscriptKhmer,
    },
    null,
    2
  );
}

/**
 * Generate formatted string content based on format & mode
 */
export function getSubtitleContent(
  item: AudioFileItem,
  format: ExportFormat,
  mode: TargetLanguageMode
): string {
  switch (format) {
    case 'srt':
      return formatCuesToSrt(item.cues, mode);
    case 'vtt':
      return formatCuesToVtt(item.cues, mode);
    case 'txt':
      return formatCuesToTxt(item.cues, mode);
    case 'json':
      return formatCuesToJson(item, mode);
    default:
      return formatCuesToSrt(item.cues, mode);
  }
}

/**
 * Trigger browser file download
 */
export function triggerBrowserDownload(content: string, fileName: string, mimeType = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/**
 * Download single subtitle file.
 * The file name is strictly identical to the audio file name with the subtitle extension!
 */
export function downloadSingleSubtitle(
  item: AudioFileItem,
  format: ExportFormat = 'srt',
  mode: TargetLanguageMode = 'khmer'
): string {
  const content = getSubtitleContent(item, format, mode);
  const outFileName = getSubtitleFileName(item.fileName, format);
  const mimeMap: Record<ExportFormat, string> = {
    srt: 'application/x-subrip;charset=utf-8',
    vtt: 'text/vtt;charset=utf-8',
    txt: 'text/plain;charset=utf-8',
    json: 'application/json;charset=utf-8',
  };
  triggerBrowserDownload(content, outFileName, mimeMap[format]);
  return outFileName;
}

/**
 * Batch download all completed subtitles packaged in a .zip archive.
 * Inside the zip, each subtitle file name is exactly identical to the audio file name!
 */
export async function batchDownloadZip(
  items: AudioFileItem[],
  format: ExportFormat = 'srt',
  mode: TargetLanguageMode = 'khmer',
  zipName = 'subtitles_khmer_batch.zip'
): Promise<number> {
  const completedItems = items.filter((i) => i.status === 'completed' && i.cues.length > 0);
  if (completedItems.length === 0) return 0;

  const zip = new JSZip();

  completedItems.forEach((item) => {
    const content = getSubtitleContent(item, format, mode);
    // Strict requirement: Subtitle file name must match audio file name!
    const subFileName = getSubtitleFileName(item.fileName, format);
    zip.file(subFileName, content);
  });

  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const url = URL.createObjectURL(zipBlob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = zipName.endsWith('.zip') ? zipName : `${zipName}.zip`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);

  return completedItems.length;
}

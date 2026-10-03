export type ExportFormat = 'srt' | 'vtt' | 'txt' | 'json';

export type TargetLanguageMode = 'khmer' | 'original' | 'dual_khmer_first' | 'dual_orig_first';

export interface DetectedLanguage {
  code: string;
  name: string;
  nativeName?: string;
  confidence?: number;
}

export interface SubtitleCue {
  index: number;
  startTime: string; // "00:00:01,250"
  endTime: string;   // "00:00:04,500"
  originalText: string;
  khmerText: string;
  speaker?: string;
}

export interface AudioFileItem {
  id: string;
  file?: File;
  fileName: string;
  fileSize: number;
  folderPath?: string;
  audioBase64?: string;
  mimeType: string;
  audioUrl?: string;
  duration?: number;
  status: 'idle' | 'processing' | 'waiting_quota' | 'completed' | 'error';
  quotaRetryInSeconds?: number;
  progress: number; // 0 - 100
  errorMessage?: string;
  detectedLanguage?: DetectedLanguage;
  durationEstimateSeconds?: number;
  cues: SubtitleCue[];
  fullTranscriptOriginal?: string;
  fullTranscriptKhmer?: string;
  srtKhmer?: string;
  srtOriginal?: string;
  srtDual?: string;
  vttKhmer?: string;
  vttOriginal?: string;
  vttDual?: string;
}

export interface BatchSettings {
  targetMode: TargetLanguageMode;
  exportFormat: ExportFormat;
  concurrency: number;
  autoStartOnUpload: boolean;
}

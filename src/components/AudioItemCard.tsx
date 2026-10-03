import React, { useRef, useState, useEffect } from 'react';
import {
  FileAudio,
  Play,
  Pause,
  Download,
  Eye,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2,
  ChevronDown,
  Globe,
  Clock,
  HardDrive,
  Volume2
} from 'lucide-react';
import { AudioFileItem, ExportFormat, TargetLanguageMode } from '../types';
import { formatFileSize, formatSecondsToTime } from '../utils/fileHelpers';
import { downloadSingleSubtitle, getSubtitleFileName } from '../utils/subtitleFormatter';

interface AudioItemCardProps {
  item: AudioFileItem;
  currentFormat: ExportFormat;
  targetMode: TargetLanguageMode;
  onOpenPreview: (item: AudioFileItem) => void;
  onRemove: (id: string) => void;
  onProcessSingle: (item: AudioFileItem) => void;
  isPlayingGlobal: boolean;
  onTogglePlay: (id: string) => void;
}

export const AudioItemCard: React.FC<AudioItemCardProps> = ({
  item,
  currentFormat,
  targetMode,
  onOpenPreview,
  onRemove,
  onProcessSingle,
  isPlayingGlobal,
  onTogglePlay,
}) => {
  const [showFormatDropdown, setShowFormatDropdown] = useState(false);
  const subtitleOutName = getSubtitleFileName(item.fileName, currentFormat);

  const handleDownload = (format: ExportFormat) => {
    downloadSingleSubtitle(item, format, targetMode);
    setShowFormatDropdown(false);
  };

  return (
    <div
      className={`rounded-2xl border transition-all duration-200 overflow-hidden ${
        item.status === 'completed'
          ? 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
          : item.status === 'processing'
          ? 'bg-slate-900/90 border-amber-500/40 shadow-lg shadow-amber-500/5'
          : item.status === 'waiting_quota'
          ? 'bg-slate-900/90 border-amber-500/30'
          : item.status === 'error'
          ? 'bg-slate-900/90 border-red-500/30'
          : 'bg-slate-900/60 border-slate-800/80 hover:border-slate-700'
      }`}
    >
      {/* Main Row */}
      <div className="p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        {/* Left Side: Audio details & Filename match */}
        <div className="flex items-start gap-3.5 min-w-0 flex-1">
          {/* Play/Pause Button */}
          {item.audioUrl ? (
            <button
              type="button"
              onClick={() => onTogglePlay(item.id)}
              title={isPlayingGlobal ? 'Pause audio' : 'Play audio'}
              className={`mt-0.5 w-10 h-10 shrink-0 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                isPlayingGlobal
                  ? 'bg-amber-500 text-slate-950 shadow-md ring-2 ring-amber-400/40'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700/80'
              }`}
            >
              {isPlayingGlobal ? (
                <Pause className="w-4 h-4 fill-current" />
              ) : (
                <Play className="w-4 h-4 fill-current ml-0.5" />
              )}
            </button>
          ) : (
            <div className="mt-0.5 w-10 h-10 shrink-0 rounded-xl bg-slate-800/80 text-slate-500 flex items-center justify-center border border-slate-800">
              <FileAudio className="w-4 h-4" />
            </div>
          )}

          {/* File Name & Subtitle Destination Tag */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span className="font-semibold text-white truncate text-sm sm:text-base" title={item.fileName}>
                {item.fileName}
              </span>

              {/* Strict Name Matching Output Tag */}
              <span
                className="inline-flex items-center gap-1 text-xs font-mono font-medium text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20"
                title="Generated subtitle file strictly matches audio file name"
              >
                <span>➔</span>
                <span>{subtitleOutName}</span>
              </span>
            </div>

            {/* Zero-Pill Unboxed Metadata Line */}
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 font-mono-code tabular-figures">
              <span>{formatFileSize(item.fileSize)}</span>
              {item.duration !== undefined && item.duration > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{formatSecondsToTime(item.duration)}</span>
                </>
              )}
              {item.folderPath && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-slate-400 truncate max-w-xs" title={item.folderPath}>
                    {item.folderPath}
                  </span>
                </>
              )}
              {item.detectedLanguage && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-slate-300 font-sans font-medium">
                    {item.detectedLanguage.name} ({item.detectedLanguage.code.toUpperCase()})
                  </span>
                  {item.detectedLanguage.confidence !== undefined && (
                    <span className="text-amber-400">
                      {Math.round(item.detectedLanguage.confidence * 100)}%
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right Side: Status indicator & Action buttons */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0 self-end md:self-center">
          {/* Status Indicators */}
          {item.status === 'processing' && (
            <div className="flex items-center gap-1.5 text-xs text-amber-400 font-medium font-mono-code">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Transcribing...</span>
            </div>
          )}

          {item.status === 'waiting_quota' && (
            <div className="flex items-center gap-1.5 text-xs text-amber-300 font-medium font-mono-code animate-pulse">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>Pacing quota ({item.quotaRetryInSeconds || 15}s)</span>
            </div>
          )}

          {item.status === 'completed' && (
            <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium font-mono-code">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{item.cues.length} cues</span>
            </div>
          )}

          {item.status === 'error' && (
            <div className="flex items-center gap-1.5 text-xs text-red-400 font-medium">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>Failed</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-1.5">
            {(item.status === 'idle' || item.status === 'waiting_quota' || item.status === 'error') && (
              <button
                type="button"
                onClick={() => onProcessSingle(item)}
                className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-sm transition-all cursor-pointer whitespace-nowrap"
              >
                {item.status === 'waiting_quota' ? 'Retry Now' : item.status === 'error' ? 'Retry' : 'Transcribe'}
              </button>
            )}

            {item.status === 'completed' && (
              <>
                {/* Inspect Subtitles Button */}
                <button
                  type="button"
                  onClick={() => onOpenPreview(item)}
                  title="View and edit subtitles in studio editor"
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-medium text-xs border border-slate-700 flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap"
                >
                  <Eye className="w-3.5 h-3.5 text-amber-400" />
                  <span>Inspect</span>
                </button>

                {/* Download Subtitle Single Button with format dropdown */}
                <div className="relative">
                  <div className="inline-flex rounded-lg overflow-hidden shadow-sm">
                    <button
                      type="button"
                      onClick={() => handleDownload(currentFormat)}
                      title={`Download ${subtitleOutName}`}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download .{currentFormat}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowFormatDropdown(!showFormatDropdown)}
                      className="px-1.5 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-slate-950 transition-all cursor-pointer border-l border-emerald-800"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Format dropdown */}
                  {showFormatDropdown && (
                    <div className="absolute right-0 top-full mt-1.5 z-30 w-44 rounded-xl bg-slate-950 border border-slate-800 shadow-2xl p-1 text-xs">
                      {(['srt', 'vtt', 'txt', 'json'] as ExportFormat[]).map((fmt) => (
                        <button
                          key={fmt}
                          type="button"
                          onClick={() => handleDownload(fmt)}
                          className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-800 text-slate-200 hover:text-white flex items-center justify-between transition-colors cursor-pointer"
                        >
                          <span className="uppercase font-semibold font-mono">.{fmt}</span>
                          <span className="text-[10px] text-slate-400 truncate max-w-[90px]">
                            {getSubtitleFileName(item.fileName, fmt)}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Remove item button */}
            <button
              type="button"
              onClick={() => onRemove(item.id)}
              title="Remove audio file from batch"
              className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Processing Animation Bar */}
      {item.status === 'processing' && (
        <div className="w-full bg-slate-950 h-1 overflow-hidden">
          <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-300 h-full w-full animate-pulse" />
        </div>
      )}

      {/* Subtitle Snippet Preview for Completed Items */}
      {item.status === 'completed' && item.cues.length > 0 && (
        <div className="px-4 py-2.5 bg-slate-950/70 border-t border-slate-800/80 flex items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-2 truncate text-slate-300 min-w-0">
            <span className="text-[11px] font-mono text-amber-400 shrink-0 tabular-figures">
              [{item.cues[0].startTime}]
            </span>
            <span className="font-khmer text-amber-300 font-medium truncate">
              {item.cues[0].khmerText}
            </span>
            <span className="text-slate-500 truncate hidden sm:inline">
              ({item.cues[0].originalText})
            </span>
          </div>

          <button
            type="button"
            onClick={() => onOpenPreview(item)}
            className="text-amber-400 hover:text-amber-300 hover:underline shrink-0 font-medium cursor-pointer"
          >
            +{item.cues.length - 1} more cues
          </button>
        </div>
      )}

      {/* Error message detail if failed */}
      {item.status === 'error' && item.errorMessage && (
        <div className="px-4 py-2 bg-red-950/40 border-t border-red-900/50 text-xs text-red-300 flex items-center justify-between">
          <span className="truncate">
            {item.errorMessage.includes('demand') || item.errorMessage.includes('503')
              ? 'AI model temporarily experiencing high demand spikes. Click Retry to re-run.'
              : item.errorMessage.includes('429') || item.errorMessage.includes('quota')
              ? 'Gemini free tier rate limit reached (5 req/min). Click Retry or wait for quota reset.'
              : item.errorMessage}
          </span>
          <button
            type="button"
            onClick={() => onProcessSingle(item)}
            className="underline hover:text-white shrink-0 ml-2 font-semibold cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
};

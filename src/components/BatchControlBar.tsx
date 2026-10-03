import React from 'react';
import {
  Play,
  Download,
  Trash2,
  Archive,
  RefreshCw,
  FileCode,
  Languages,
  Sliders,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { BatchSettings, ExportFormat, TargetLanguageMode } from '../types';

interface BatchControlBarProps {
  totalCount: number;
  completedCount: number;
  processingCount: number;
  waitingQuotaCount: number;
  errorCount: number;
  settings: BatchSettings;
  onUpdateSettings: (newSettings: Partial<BatchSettings>) => void;
  onStartBatch: () => void;
  onBatchDownloadZip: () => void;
  onClearAll: () => void;
  onRetryFailed: () => void;
  isProcessing: boolean;
}

export const BatchControlBar: React.FC<BatchControlBarProps> = ({
  totalCount,
  completedCount,
  processingCount,
  waitingQuotaCount,
  errorCount,
  settings,
  onUpdateSettings,
  onStartBatch,
  onBatchDownloadZip,
  onClearAll,
  onRetryFailed,
  isProcessing,
}) => {
  const percentCompleted = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const idleCount = totalCount - completedCount - processingCount - waitingQuotaCount - errorCount;

  return (
    <div className="w-full bg-slate-900/90 rounded-2xl border border-slate-800 p-5 shadow-lg space-y-4">
      {/* Top Row: Segmented Controls for Subtitle Translation Mode & Output Format */}
      <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
        {/* Subtitle Translation Mode */}
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap">
            Subtitle Mode:
          </span>

          <div className="inline-flex rounded-xl bg-slate-950 p-1 border border-slate-800/80">
            <button
              type="button"
              onClick={() => onUpdateSettings({ targetMode: 'khmer' })}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                settings.targetMode === 'khmer'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <span className="font-khmer">Khmer Only (ភាសាខ្មែរ)</span>
            </button>

            <button
              type="button"
              onClick={() => onUpdateSettings({ targetMode: 'dual_khmer_first' })}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                settings.targetMode === 'dual_khmer_first'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <span>Bilingual Dual (Khmer + Audio)</span>
            </button>

            <button
              type="button"
              onClick={() => onUpdateSettings({ targetMode: 'original' })}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                settings.targetMode === 'original'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <span>Original Language Only</span>
            </button>
          </div>
        </div>

        {/* Subtitle Output Format & Pacing */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap">
            Format:
          </span>

          <div className="inline-flex rounded-xl bg-slate-950 p-1 border border-slate-800/80">
            {(['srt', 'vtt', 'txt', 'json'] as ExportFormat[]).map((fmt) => (
              <button
                key={fmt}
                type="button"
                onClick={() => onUpdateSettings({ exportFormat: fmt })}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-mono font-semibold uppercase transition-all whitespace-nowrap cursor-pointer ${
                  settings.exportFormat === fmt
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                .{fmt}
              </button>
            ))}
          </div>

          {/* Pacing Speed Selection */}
          <div className="flex items-center gap-1.5 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800/80 text-xs text-slate-400">
            <span className="whitespace-nowrap">Execution:</span>
            <select
              value={settings.concurrency}
              onChange={(e) => onUpdateSettings({ concurrency: Number(e.target.value) })}
              className="bg-transparent text-amber-400 font-semibold focus:outline-none cursor-pointer"
            >
              <option value={1} className="bg-slate-900 text-slate-100">Sequential (Safe Paced)</option>
              <option value={2} className="bg-slate-900 text-slate-100">2 Parallel</option>
              <option value={3} className="bg-slate-900 text-slate-100">3 Parallel</option>
            </select>
          </div>
        </div>
      </div>

      {/* Bottom Row: Unboxed Stats, Progress Bar & Batch Action Buttons */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        {/* Progress & Clean Unboxed Stats */}
        <div className="flex-1 w-full sm:w-auto">
          <div className="flex items-center justify-between mb-2 text-xs">
            <div className="flex items-center gap-2 text-slate-400 font-mono-code tabular-figures">
              <span className="text-white font-semibold">
                {completedCount} of {totalCount} completed
              </span>
              <span aria-hidden="true">·</span>
              <span>{percentCompleted}%</span>

              {processingCount > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-amber-400 flex items-center gap-1">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    <span>Processing {processingCount}</span>
                  </span>
                </>
              )}

              {waitingQuotaCount > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-amber-300">
                    Quota waiting {waitingQuotaCount}
                  </span>
                </>
              )}

              {errorCount > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <button
                    type="button"
                    onClick={onRetryFailed}
                    className="text-red-400 hover:text-red-300 underline cursor-pointer"
                  >
                    {errorCount} failed (Retry)
                  </button>
                </>
              )}
            </div>

            <span className="text-slate-500 font-mono text-xs hidden md:inline">
              Target: <strong className="text-amber-400">.{settings.exportFormat}</strong>
            </span>
          </div>

          <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
            <div
              className="bg-gradient-to-r from-amber-500 to-emerald-400 h-full transition-all duration-300 ease-out"
              style={{ width: `${percentCompleted}%` }}
            />
          </div>
        </div>

        {/* Buttons */}
        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto justify-end">
          {idleCount > 0 && (
            <button
              type="button"
              onClick={onStartBatch}
              disabled={isProcessing}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-bold text-xs tracking-wide shadow-md transition-all cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{isProcessing ? 'Processing Queue...' : `Transcribe All (${idleCount})`}</span>
            </button>
          )}

          {/* Batch Download ZIP Button */}
          <button
            type="button"
            onClick={onBatchDownloadZip}
            disabled={completedCount === 0}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              completedCount > 0
                ? 'bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-950 shadow-md shadow-emerald-500/10'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50'
            }`}
          >
            <Archive className="w-3.5 h-3.5" />
            <span>Download All Subtitles (.zip)</span>
            {completedCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-slate-950 text-emerald-300 font-mono text-[10px]">
                {completedCount}
              </span>
            )}
          </button>

          {/* Clear button */}
          <button
            type="button"
            onClick={onClearAll}
            title="Clear all audio files from queue"
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-red-500/20 text-slate-400 hover:text-red-400 border border-slate-700/80 hover:border-red-500/30 transition-all cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

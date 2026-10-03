import React, { useState, useEffect, useRef } from 'react';
import {
  FolderUp,
  FileAudio,
  Sparkles,
  Download,
  Archive,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  HardDrive,
  Globe,
  Languages,
  Layers,
  HelpCircle,
  AlertCircle,
  FileText,
  Settings,
  ChevronRight,
  BookOpen
} from 'lucide-react';
import { AudioFolderUploader } from './components/AudioFolderUploader';
import { BatchControlBar } from './components/BatchControlBar';
import { AudioItemCard } from './components/AudioItemCard';
import { SubtitlePreviewModal } from './components/SubtitlePreviewModal';
import { AudioFileItem, BatchSettings, ExportFormat, SubtitleCue, TargetLanguageMode } from './types';
import { batchDownloadZip, downloadSingleSubtitle, getSubtitleFileName } from './utils/subtitleFormatter';
import { fileToBase64, formatFileSize, formatSecondsToTime } from './utils/fileHelpers';

export default function App() {
  const [items, setItems] = useState<AudioFileItem[]>([]);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [selectedPreviewItem, setSelectedPreviewItem] = useState<AudioFileItem | null>(null);
  const [isLoadingDemo, setIsLoadingDemo] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'processing' | 'waiting_quota' | 'idle' | 'error'>('all');
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [currentlyPlayingId, setCurrentlyPlayingId] = useState<string | null>(null);
  const globalAudioRef = useRef<HTMLAudioElement | null>(null);

  const [settings, setSettings] = useState<BatchSettings>({
    targetMode: 'khmer',
    exportFormat: 'srt',
    concurrency: 1, // Sequential execution to stay strictly within 5 RPM Free Tier quota
    autoStartOnUpload: false,
  });

  const showNotification = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification((curr) => (curr?.message === message ? null : curr));
    }, 4500);
  };

  const handleUpdateSettings = (newSettings: Partial<BatchSettings>) => {
    setSettings((prev) => ({ ...prev, ...newSettings }));
  };

  // Add new files from folder or file selector
  const handleAddFiles = (newItems: AudioFileItem[]) => {
    setItems((prev) => {
      const existingKeys = new Set(prev.map((i) => `${i.fileName}_${i.folderPath || ''}`));
      const unique = newItems.filter((i) => !existingKeys.has(`${i.fileName}_${i.folderPath || ''}`));
      return [...prev, ...unique];
    });

    showNotification(`Added ${newItems.length} audio file(s) to the batch queue.`, 'info');
  };

  // Load Demo Batch Folder from server API
  const handleLoadDemoFiles = async () => {
    setIsLoadingDemo(true);
    try {
      const res = await fetch('/api/demo-samples');
      if (!res.ok) throw new Error('Failed to fetch demo samples');
      const data = await res.json();

      const demoItems: AudioFileItem[] = data.samples.map((s: any) => {
        const binary = atob(s.audioBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: s.mimeType || 'audio/wav' });
        const audioUrl = URL.createObjectURL(blob);

        return {
          id: `demo_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          fileName: s.fileName,
          fileSize: s.fileSize || 120000,
          folderPath: 'sample_audio_folder',
          mimeType: s.mimeType || 'audio/wav',
          audioBase64: s.audioBase64,
          audioUrl,
          duration: 4,
          status: 'idle',
          progress: 0,
          cues: [],
        };
      });

      handleAddFiles(demoItems);
      showNotification('Loaded 3 demo audio files (English, French, Japanese). Ready to batch export!', 'success');
    } catch (err: any) {
      console.error(err);
      showNotification(`Failed to load demo files: ${err.message}`, 'error');
    } finally {
      setIsLoadingDemo(false);
    }
  };

  // Single audio playback coordinator
  const handleTogglePlay = (id: string) => {
    if (currentlyPlayingId === id) {
      if (globalAudioRef.current) {
        globalAudioRef.current.pause();
      }
      setCurrentlyPlayingId(null);
    } else {
      const targetItem = items.find((i) => i.id === id);
      if (!targetItem?.audioUrl) return;

      if (!globalAudioRef.current) {
        globalAudioRef.current = new Audio();
        globalAudioRef.current.onended = () => setCurrentlyPlayingId(null);
      }
      globalAudioRef.current.src = targetItem.audioUrl;
      globalAudioRef.current.play().catch(console.error);
      setCurrentlyPlayingId(id);
    }
  };

  // Process a single audio item through Gemini API with rate limit & 503 resilience
  const processItem = async (item: AudioFileItem): Promise<boolean> => {
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, status: 'processing', progress: 20, errorMessage: undefined } : i))
    );

    try {
      let base64 = item.audioBase64;
      if (!base64 && item.file) {
        base64 = await fileToBase64(item.file);
      }

      if (!base64) {
        throw new Error('Unable to read audio file data');
      }

      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, progress: 50 } : i))
      );

      const response = await fetch('/api/subtitles/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64: base64,
          mimeType: item.mimeType || 'audio/mp3',
          fileName: item.fileName,
          targetMode: settings.targetMode,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown server error' }));
        const isRateLimit =
          response.status === 429 ||
          errorData.isRateLimit ||
          String(errorData.error).includes('429') ||
          String(errorData.error).includes('quota') ||
          String(errorData.error).includes('RESOURCE_EXHAUSTED');

        const is503HighDemand =
          response.status === 503 ||
          errorData.isHighDemand ||
          String(errorData.error).includes('503') ||
          String(errorData.error).includes('high demand') ||
          String(errorData.error).includes('UNAVAILABLE');

        if (isRateLimit || is503HighDemand) {
          const waitSec = Number(errorData.retryDelaySeconds) || (is503HighDemand ? 5 : 20);
          showNotification(
            is503HighDemand
              ? `AI service spike encountered. Auto-retrying ${item.fileName} in ${waitSec}s...`
              : `Free tier rate limit reached (5 req/min). Auto-waiting ${waitSec}s before retrying ${item.fileName}...`,
            'info'
          );

          for (let s = waitSec; s > 0; s--) {
            setItems((prev) =>
              prev.map((i) =>
                i.id === item.id
                  ? {
                      ...i,
                      status: 'waiting_quota',
                      quotaRetryInSeconds: s,
                      errorMessage: is503HighDemand
                        ? `Temporary high demand spike: Retrying in ${s}s...`
                        : `Pacing quota limit: Retrying in ${s}s...`,
                    }
                  : i
              )
            );
            await new Promise((r) => setTimeout(r, 1000));
          }

          return await processItem(item);
        }

        throw new Error(errorData.error || `Server responded with status ${response.status}`);
      }

      const data = await response.json();

      setItems((prev) =>
        prev.map((i) => {
          if (i.id !== item.id) return i;
          return {
            ...i,
            status: 'completed',
            progress: 100,
            detectedLanguage: data.detectedLanguage,
            durationEstimateSeconds: data.durationEstimateSeconds,
            cues: data.cues || [],
            fullTranscriptOriginal: data.fullTranscriptOriginal,
            fullTranscriptKhmer: data.fullTranscriptKhmer,
            srtKhmer: data.srtKhmer,
            srtOriginal: data.srtOriginal,
            srtDual: data.srtDual,
            vttKhmer: data.vttKhmer,
            vttOriginal: data.vttOriginal,
            vttDual: data.vttDual,
          };
        })
      );
      return true;
    } catch (err: any) {
      console.error(`Error processing ${item.fileName}:`, err);
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? { ...i, status: 'error', progress: 0, errorMessage: err.message || 'Processing failed' }
            : i
        )
      );
      return false;
    }
  };

  // Batch runner with concurrency control & respectful pacing
  const startBatch = async () => {
    if (isBatchProcessing) return;
    setIsBatchProcessing(true);

    const pendingItems = items.filter((i) => i.status === 'idle' || i.status === 'error');
    if (pendingItems.length === 0) {
      setIsBatchProcessing(false);
      return;
    }

    const concurrency = Math.max(1, Math.min(settings.concurrency || 1, 4));
    let currentIndex = 0;

    const worker = async () => {
      while (currentIndex < pendingItems.length) {
        const itemToProcess = pendingItems[currentIndex];
        currentIndex++;
        if (itemToProcess) {
          await processItem(itemToProcess);
          // Pacing delay to avoid triggering 5 RPM Free Tier rate limit
          if (currentIndex < pendingItems.length) {
            await new Promise((r) => setTimeout(r, 2500));
          }
        }
      }
    };

    const workers = Array.from({ length: concurrency }).map(() => worker());
    await Promise.all(workers);

    setIsBatchProcessing(false);
    showNotification('Batch transcription and translation completed!', 'success');
  };

  // Batch download ZIP
  const handleBatchDownloadZip = async () => {
    const completed = items.filter((i) => i.status === 'completed' && i.cues.length > 0);
    if (completed.length === 0) {
      showNotification('No completed subtitles to download yet.', 'info');
      return;
    }

    try {
      const count = await batchDownloadZip(
        completed,
        settings.exportFormat,
        settings.targetMode,
        `subtitles_khmer_${settings.exportFormat}_export.zip`
      );
      showNotification(
        `Downloaded batch ZIP containing ${count} subtitle files named identically to audio files!`,
        'success'
      );
    } catch (err: any) {
      showNotification(`Batch download error: ${err.message}`, 'error');
    }
  };

  const handleClearAll = () => {
    if (items.length === 0) return;
    if (confirm('Clear all audio files from the queue?')) {
      if (globalAudioRef.current) {
        globalAudioRef.current.pause();
      }
      setCurrentlyPlayingId(null);
      items.forEach((i) => {
        if (i.audioUrl && i.audioUrl.startsWith('blob:')) {
          URL.revokeObjectURL(i.audioUrl);
        }
      });
      setItems([]);
      showNotification('Cleared all items from queue.', 'info');
    }
  };

  const handleRemoveSingle = (id: string) => {
    if (currentlyPlayingId === id && globalAudioRef.current) {
      globalAudioRef.current.pause();
      setCurrentlyPlayingId(null);
    }
    setItems((prev) => {
      const found = prev.find((i) => i.id === id);
      if (found?.audioUrl && found.audioUrl.startsWith('blob:')) {
        URL.revokeObjectURL(found.audioUrl);
      }
      return prev.filter((i) => i.id !== id);
    });
  };

  const handleUpdateCues = (itemId: string, updatedCues: SubtitleCue[]) => {
    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, cues: updatedCues } : i))
    );
  };

  const handleRetryFailed = () => {
    startBatch();
  };

  // Computed metrics with tabular figures
  const totalCount = items.length;
  const completedCount = items.filter((i) => i.status === 'completed').length;
  const processingCount = items.filter((i) => i.status === 'processing').length;
  const waitingQuotaCount = items.filter((i) => i.status === 'waiting_quota').length;
  const errorCount = items.filter((i) => i.status === 'error').length;
  const totalDuration = items.reduce((acc, curr) => acc + (curr.duration || 0), 0);

  // Filter items
  const filteredItems = items.filter((item) => {
    const matchesSearch =
      item.fileName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.detectedLanguage?.name || '').toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;
    if (statusFilter === 'all') return true;
    return item.status === statusFilter;
  });

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100 flex flex-col selection:bg-amber-500/30 selection:text-amber-200">
      {/* Toast Notification */}
      {notification && (
        <div className="fixed bottom-6 right-6 z-50 animate-fade-in duration-200">
          <div
            className={`px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border text-xs font-medium ${
              notification.type === 'success'
                ? 'bg-emerald-950/95 border-emerald-500/50 text-emerald-200'
                : notification.type === 'error'
                ? 'bg-red-950/95 border-red-500/50 text-red-200'
                : 'bg-slate-900/95 border-amber-500/50 text-amber-200'
            }`}
          >
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : notification.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            ) : (
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
            )}
            <span>{notification.message}</span>
          </div>
        </div>
      )}

      {/* Top Bar Contract: Zone 1 (Wordmark) — Zone 2 (Text nav links) — Zone 3 (Primary action) */}
      <header className="sticky top-0 z-40 bg-[#0b0f19]/90 backdrop-blur-md border-b border-slate-800/80 px-4 sm:px-8 py-3.5 flex items-center justify-between gap-4">
        {/* Zone 1: Single text element wordmark */}
        <div className="flex items-center gap-3">
          <a href="/" className="text-base sm:text-lg font-bold tracking-tight text-white flex items-center gap-2 hover:opacity-90 transition-opacity">
            <span className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center text-slate-950 font-bold font-khmer text-sm shadow-sm">
              ខ្មែរ
            </span>
            <span>SubKhmer Studio</span>
          </a>
        </div>

        {/* Zone 2: Clean text navigation links */}
        <nav className="hidden lg:flex items-center gap-6 text-xs font-medium text-slate-400">
          <a href="#queue" className="text-slate-200 hover:text-white transition-colors">
            Audio Queue ({totalCount})
          </a>
          <a href="#settings" className="hover:text-slate-200 transition-colors">
            Khmer Translation Engine
          </a>
          <button
            type="button"
            onClick={() => setShowGuideModal(true)}
            className="hover:text-slate-200 transition-colors cursor-pointer"
          >
            Subtitle Import Guide
          </button>
        </nav>

        {/* Zone 3: Primary Action Buttons */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleLoadDemoFiles}
            disabled={isLoadingDemo}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-all cursor-pointer whitespace-nowrap disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Load Demo Samples</span>
          </button>

          {completedCount > 0 && (
            <button
              type="button"
              onClick={handleBatchDownloadZip}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-950 font-bold text-xs shadow-md shadow-emerald-500/10 transition-all cursor-pointer whitespace-nowrap"
            >
              <Archive className="w-3.5 h-3.5" />
              <span>Download All ({completedCount} .zip)</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Studio Summary Strip: Zero-Pill Unboxed Text */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-2 border-b border-slate-800/60">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              Batch Subtitle Export &amp; Khmer Translation
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Automatic language detection · Translation into <span className="font-khmer text-amber-300">ភាសាខ្មែរ</span> · Subtitle filenames strictly match audio filenames
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-400 font-mono-code tabular-figures">
            <span>{totalCount} audio files</span>
            <span aria-hidden="true">·</span>
            <span>{formatSecondsToTime(totalDuration)} total audio</span>
            <span aria-hidden="true">·</span>
            <span className="text-emerald-400">{completedCount} exported</span>
          </div>
        </div>

        {/* Audio Folder Upload Dropzone */}
        <AudioFolderUploader
          onAddFiles={handleAddFiles}
          isLoadingDemo={isLoadingDemo}
          onLoadDemoFiles={handleLoadDemoFiles}
          queueCount={totalCount}
        />

        {/* Batch Queue & Controls */}
        {items.length > 0 && (
          <div id="queue" className="space-y-4">
            {/* Control Bar */}
            <BatchControlBar
              totalCount={totalCount}
              completedCount={completedCount}
              processingCount={processingCount}
              waitingQuotaCount={waitingQuotaCount}
              errorCount={errorCount}
              settings={settings}
              onUpdateSettings={handleUpdateSettings}
              onStartBatch={startBatch}
              onBatchDownloadZip={handleBatchDownloadZip}
              onClearAll={handleClearAll}
              onRetryFailed={handleRetryFailed}
              isProcessing={isBatchProcessing}
            />

            {/* Search & Filter Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-2xl border border-slate-800 text-xs">
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder="Filter audio file or language..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Status filter tabs */}
              <div className="flex items-center gap-1 overflow-x-auto w-full sm:w-auto">
                {(['all', 'idle', 'processing', 'waiting_quota', 'completed', 'error'] as const).map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setStatusFilter(status)}
                    className={`px-3 py-1 rounded-lg capitalize transition-colors font-medium whitespace-nowrap cursor-pointer ${
                      statusFilter === status
                        ? 'bg-amber-500 text-slate-950 font-bold'
                        : 'text-slate-400 hover:text-slate-200 bg-slate-950/60 border border-slate-800'
                    }`}
                  >
                    {status === 'all'
                      ? `All (${totalCount})`
                      : status === 'waiting_quota'
                      ? 'Quota Wait'
                      : `${status}`}
                  </button>
                ))}
              </div>
            </div>

            {/* Audio Item List */}
            <div className="space-y-3">
              {filteredItems.map((item) => (
                <AudioItemCard
                  key={item.id}
                  item={item}
                  currentFormat={settings.exportFormat}
                  targetMode={settings.targetMode}
                  onOpenPreview={(it) => setSelectedPreviewItem(it)}
                  onRemove={handleRemoveSingle}
                  onProcessSingle={processItem}
                  isPlayingGlobal={currentlyPlayingId === item.id}
                  onTogglePlay={handleTogglePlay}
                />
              ))}

              {filteredItems.length === 0 && (
                <div className="text-center py-12 bg-slate-900/40 rounded-2xl border border-slate-800">
                  <p className="text-slate-400 text-sm">No audio files match your filter.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Feature Highlights when empty */}
        {items.length === 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-4">
            <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 space-y-2">
              <h3 className="font-semibold text-white text-sm">Automatic Language Detection</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Identifies speech in English, Japanese, French, Chinese, Spanish, Vietnamese, Khmer, and 80+ world languages directly from the audio track.
              </p>
            </div>

            <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 space-y-2">
              <h3 className="font-semibold text-white text-sm font-khmer">ភាសាខ្មែរ Subtitle Translation</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Generates natural, fluent Khmer subtitles. Choose between Khmer only, bilingual dual subtitles, or preserve original verbatim speech.
              </p>
            </div>

            <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 space-y-2">
              <h3 className="font-semibold text-white text-sm">Strict Name Match &amp; Batch ZIP</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Every exported subtitle file name strictly matches its audio file name (<code className="text-slate-300 font-mono">ep1.mp3</code> ➔ <code className="text-emerald-400 font-mono">ep1.srt</code>). Download individually or as a single batch ZIP archive.
              </p>
            </div>
          </div>
        )}
      </main>

      {/* Subtitle Preview and Cue Editor Modal */}
      {selectedPreviewItem && (
        <SubtitlePreviewModal
          item={selectedPreviewItem}
          onClose={() => setSelectedPreviewItem(null)}
          targetMode={settings.targetMode}
          exportFormat={settings.exportFormat}
          onUpdateCues={handleUpdateCues}
        />
      )}

      {/* Subtitle Import Guide Modal */}
      {showGuideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="relative w-full max-w-2xl bg-slate-900 rounded-3xl border border-slate-800 p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-white text-base">Subtitle Import Guide</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs text-slate-300 leading-relaxed">
              <div className="space-y-1">
                <h4 className="font-semibold text-amber-300">1. Adobe Premiere Pro &amp; DaVinci Resolve</h4>
                <p className="text-slate-400">
                  Export as <strong className="text-white">.srt</strong>. Drag the <code className="text-amber-400 font-mono">.srt</code> file directly into your timeline. In the Essential Graphics panel, choose a Khmer font like <strong className="text-white font-khmer">Kantumruy Pro</strong> or <strong className="text-white font-khmer">Battambang</strong> for proper vowel stacking.
                </p>
              </div>

              <div className="space-y-1">
                <h4 className="font-semibold text-amber-300">2. CapCut Desktop &amp; Mobile</h4>
                <p className="text-slate-400">
                  Select <strong className="text-white">Text ➔ Auto Captions / Local Subtitles</strong> and import the <code className="text-amber-400 font-mono">.srt</code> file. Under font styling, select any Unicode font supporting Khmer glyphs.
                </p>
              </div>

              <div className="space-y-1">
                <h4 className="font-semibold text-amber-300">3. YouTube Studio &amp; VLC Media Player</h4>
                <p className="text-slate-400">
                  YouTube accepts both <strong className="text-white">.srt</strong> and <strong className="text-white">.vtt</strong> natively. For VLC, simply keep the subtitle file in the same folder with the same name as the video/audio file—VLC loads it automatically!
                </p>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold cursor-pointer"
              >
                Close Guide
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer: Quiet copyright and clean metadata */}
      <footer className="mt-auto border-t border-slate-800/80 py-4 px-6 text-center text-xs text-slate-500 font-mono-code tabular-figures">
        <p>SubKhmer Studio · Audio Transcriber &amp; Khmer Subtitle Engine · Powered by Gemini Multimodal Audio</p>
      </footer>
    </div>
  );
}

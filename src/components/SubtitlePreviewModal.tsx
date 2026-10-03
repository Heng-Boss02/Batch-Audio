import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Play,
  Pause,
  Download,
  Copy,
  Check,
  Languages,
  Clock,
  Sparkles,
  FileCode,
  FileText,
  Volume2,
  FastForward,
  Rewind,
  Save
} from 'lucide-react';
import { AudioFileItem, ExportFormat, SubtitleCue, TargetLanguageMode } from '../types';
import {
  downloadSingleSubtitle,
  getSubtitleContent,
  getSubtitleFileName,
  formatToSrtTime
} from '../utils/subtitleFormatter';
import { formatSecondsToTime } from '../utils/fileHelpers';

interface SubtitlePreviewModalProps {
  item: AudioFileItem | null;
  onClose: () => void;
  targetMode: TargetLanguageMode;
  exportFormat: ExportFormat;
  onUpdateCues: (itemId: string, updatedCues: SubtitleCue[]) => void;
}

export const SubtitlePreviewModal: React.FC<SubtitlePreviewModalProps> = ({
  item,
  onClose,
  targetMode,
  exportFormat,
  onUpdateCues,
}) => {
  if (!item) return null;

  const [activeTab, setActiveTab] = useState<'cues' | 'raw' | 'transcript'>('cues');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(item.duration || 0);
  const [copied, setCopied] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>(exportFormat);
  const [selectedMode, setSelectedMode] = useState<TargetLanguageMode>(targetMode);
  const [cues, setCues] = useState<SubtitleCue[]>(item.cues || []);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activeCueRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setCues(item.cues || []);
  }, [item]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        setDuration(audio.duration);
      }
    };
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [item.audioUrl]);

  // Convert time string "00:00:01,250" to seconds
  const parseTimeToSeconds = (str: string): number => {
    const clean = str.replace(',', '.');
    const parts = clean.split(':');
    if (parts.length === 3) {
      return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
    } else if (parts.length === 2) {
      return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
    }
    return parseFloat(clean) || 0;
  };

  const formatSecondsToSrtString = (sec: number): string => {
    const safeSec = Math.max(0, sec);
    const hours = Math.floor(safeSec / 3600);
    const minutes = Math.floor((safeSec % 3600) / 60);
    const seconds = Math.floor(safeSec % 60);
    const ms = Math.floor((safeSec % 1) * 1000);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
  };

  // Adjust timing offset across all cues (+/- seconds)
  const adjustTimingOffset = (offsetSeconds: number) => {
    const updated = cues.map((cue) => {
      const startSec = Math.max(0, parseTimeToSeconds(cue.startTime) + offsetSeconds);
      const endSec = Math.max(0.5, parseTimeToSeconds(cue.endTime) + offsetSeconds);
      return {
        ...cue,
        startTime: formatSecondsToSrtString(startSec),
        endTime: formatSecondsToSrtString(endSec),
      };
    });
    setCues(updated);
    onUpdateCues(item.id, updated);
  };

  // Find active cue based on current audio playback position
  const activeCueIndex = cues.findIndex((c) => {
    const start = parseTimeToSeconds(c.startTime);
    const end = parseTimeToSeconds(c.endTime);
    return currentTime >= start && currentTime <= end;
  });

  const seekToTime = (timeStr: string) => {
    const sec = parseTimeToSeconds(timeStr);
    if (audioRef.current && isFinite(sec)) {
      audioRef.current.currentTime = sec;
      if (!isPlaying) {
        audioRef.current.play();
        setIsPlaying(true);
      }
    }
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleCueTextChange = (index: number, field: 'khmerText' | 'originalText', value: string) => {
    const updated = [...cues];
    updated[index] = { ...updated[index], [field]: value };
    setCues(updated);
    onUpdateCues(item.id, updated);
  };

  const subtitleContent = getSubtitleContent(
    { ...item, cues },
    selectedFormat,
    selectedMode
  );

  const currentOutFileName = getSubtitleFileName(item.fileName, selectedFormat);

  const handleCopyCode = async () => {
    await navigator.clipboard.writeText(subtitleContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    downloadSingleSubtitle({ ...item, cues }, selectedFormat, selectedMode);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-md">
      <div className="relative w-full max-w-5xl h-[92vh] max-h-[850px] bg-slate-900 rounded-3xl border border-slate-800 shadow-2xl flex flex-col overflow-hidden">
        {/* Audio Element */}
        {item.audioUrl && <audio ref={audioRef} src={item.audioUrl} preload="metadata" />}

        {/* Modal Header: Follows Zero-Pill & Top Bar math */}
        <div className="p-5 sm:p-6 border-b border-slate-800 flex items-center justify-between gap-4 bg-slate-900 shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-base sm:text-lg font-bold text-white truncate max-w-md sm:max-w-xl">
                {item.fileName}
              </h2>
              <span className="font-mono text-xs text-amber-300 font-medium">
                ➔ {currentOutFileName}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 font-mono-code tabular-figures">
              {item.detectedLanguage && (
                <span>
                  Detected: <strong className="text-slate-200">{item.detectedLanguage.name}</strong> ({item.detectedLanguage.code.toUpperCase()})
                </span>
              )}
              <span aria-hidden="true">·</span>
              <span className="text-amber-400 font-khmer">
                Khmer Translation (ភាសាខ្មែរ)
              </span>
              <span aria-hidden="true">·</span>
              <span>{cues.length} cues</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-950 font-bold text-xs shadow-md transition-all cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download {currentOutFileName}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Audio Scrubber & Controls Bar */}
        <div className="px-5 py-3.5 bg-slate-950 border-b border-slate-800/80 shrink-0 flex flex-col sm:flex-row items-center gap-4">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={togglePlay}
              className="w-10 h-10 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center justify-center font-bold shadow-md cursor-pointer transition-transform active:scale-95 shrink-0"
            >
              {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
            </button>
            <div className="text-xs font-mono text-slate-300 shrink-0 tabular-figures">
              {formatSecondsToTime(currentTime)} / {formatSecondsToTime(duration)}
            </div>
          </div>

          {/* Progress Slider */}
          <div className="flex-1 w-full flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.1}
              value={currentTime}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setCurrentTime(val);
                if (audioRef.current) audioRef.current.currentTime = val;
              }}
              className="w-full accent-amber-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
            />
          </div>

          {/* Subtitle timing offset adjuster */}
          <div className="flex items-center gap-1 text-xs text-slate-400 font-mono shrink-0">
            <span>Sync:</span>
            <button
              type="button"
              onClick={() => adjustTimingOffset(-0.5)}
              className="px-2 py-1 bg-slate-900 hover:bg-slate-800 text-slate-200 rounded border border-slate-800 cursor-pointer text-[11px]"
              title="Shift all cues 0.5s earlier"
            >
              -0.5s
            </button>
            <button
              type="button"
              onClick={() => adjustTimingOffset(0.5)}
              className="px-2 py-1 bg-slate-900 hover:bg-slate-800 text-slate-200 rounded border border-slate-800 cursor-pointer text-[11px]"
              title="Shift all cues 0.5s later"
            >
              +0.5s
            </button>
          </div>
        </div>

        {/* Tabs & Format Selectors */}
        <div className="px-5 py-2.5 bg-slate-900 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3 shrink-0 text-xs">
          {/* Main Tabs */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setActiveTab('cues')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                activeTab === 'cues' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Timeline Cues ({cues.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('raw')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                activeTab === 'raw' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Raw Code Preview
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('transcript')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                activeTab === 'transcript' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Side-by-Side Transcript
            </button>
          </div>

          {/* Mode & Format Selector */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-slate-400">
              <span>View:</span>
              <select
                value={selectedMode}
                onChange={(e) => setSelectedMode(e.target.value as TargetLanguageMode)}
                className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-200 focus:outline-none focus:border-amber-500 cursor-pointer"
              >
                <option value="khmer">Khmer Only (ភាសាខ្មែរ)</option>
                <option value="dual_khmer_first">Bilingual (Khmer + Original)</option>
                <option value="original">Original Spoken Audio</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5 text-slate-400">
              <span>Format:</span>
              <select
                value={selectedFormat}
                onChange={(e) => setSelectedFormat(e.target.value as ExportFormat)}
                className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-amber-400 font-mono font-bold focus:outline-none focus:border-amber-500 cursor-pointer"
              >
                <option value="srt">.SRT (SubRip)</option>
                <option value="vtt">.VTT (WebVTT)</option>
                <option value="txt">.TXT (Plain text)</option>
                <option value="json">.JSON</option>
              </select>
            </div>
          </div>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6">
          {activeTab === 'cues' && (
            <div className="space-y-3">
              {cues.map((cue, idx) => {
                const isActive = idx === activeCueIndex;
                return (
                  <div
                    key={cue.index || idx}
                    ref={isActive ? activeCueRef : null}
                    className={`rounded-2xl border p-4 transition-all duration-200 ${
                      isActive
                        ? 'bg-amber-500/10 border-amber-500/60 shadow-lg shadow-amber-500/5'
                        : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-4 mb-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-slate-800 text-slate-300 font-mono font-semibold flex items-center justify-center text-[11px] tabular-figures">
                          {idx + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => seekToTime(cue.startTime)}
                          className="font-mono text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer bg-slate-900 px-2 py-0.5 rounded border border-slate-800 tabular-figures"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          <span>{cue.startTime} ➔ {cue.endTime}</span>
                        </button>
                      </div>

                      {cue.speaker && (
                        <span className="text-slate-400 bg-slate-800 px-2 py-0.5 rounded text-[11px]">
                          {cue.speaker}
                        </span>
                      )}
                    </div>

                    {/* Subtitle Lines (In-place editable) */}
                    <div className="space-y-2 mt-3">
                      <div>
                        <label className="text-[11px] font-semibold text-amber-400 font-khmer block mb-1">
                          ភាសាខ្មែរ (Khmer Subtitle):
                        </label>
                        <textarea
                          rows={2}
                          value={cue.khmerText}
                          onChange={(e) => handleCueTextChange(idx, 'khmerText', e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 focus:border-amber-400 rounded-xl px-3 py-2 text-sm text-slate-100 font-khmer leading-relaxed focus:outline-none resize-none transition-colors"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-medium text-slate-400 block mb-1">
                          Original ({item.detectedLanguage?.name || 'Spoken'}):
                        </label>
                        <input
                          type="text"
                          value={cue.originalText}
                          onChange={(e) => handleCueTextChange(idx, 'originalText', e.target.value)}
                          className="w-full bg-slate-900/60 border border-slate-800/80 focus:border-slate-600 rounded-xl px-3 py-1.5 text-xs text-slate-300 focus:outline-none transition-colors"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === 'raw' && (
            <div className="relative h-full flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-slate-400 font-mono">
                  Target File: <strong className="text-amber-400">{currentOutFileName}</strong>
                </span>
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 transition-colors cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied' : 'Copy Code'}</span>
                </button>
              </div>
              <textarea
                readOnly
                value={subtitleContent}
                className="w-full flex-1 min-h-[400px] bg-slate-950 font-mono text-xs text-emerald-300 p-4 rounded-2xl border border-slate-800 resize-none focus:outline-none leading-relaxed tabular-figures"
              />
            </div>
          )}

          {activeTab === 'transcript' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-2">
                <h3 className="text-sm font-bold text-amber-400 font-khmer">
                  អត្ថបទបកប្រែជាភាសាខ្មែរ (Khmer Transcript)
                </h3>
                <p className="text-sm text-slate-200 font-khmer leading-relaxed whitespace-pre-line">
                  {item.fullTranscriptKhmer || cues.map((c) => c.khmerText).join(' ')}
                </p>
              </div>

              <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-2">
                <h3 className="text-sm font-bold text-slate-300">
                  Original Speech ({item.detectedLanguage?.name || 'Spoken'})
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">
                  {item.fullTranscriptOriginal || cues.map((c) => c.originalText).join(' ')}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

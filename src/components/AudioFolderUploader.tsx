import React, { useRef, useState } from 'react';
import {
  FolderUp,
  FileAudio,
  Sparkles,
  UploadCloud,
  FolderOpen,
  Loader2,
  Music,
  ArrowRight
} from 'lucide-react';
import { extractFilesFromDataTransfer, createFileItem, isAudioFile } from '../utils/fileHelpers';
import { AudioFileItem } from '../types';

interface AudioFolderUploaderProps {
  onAddFiles: (items: AudioFileItem[]) => void;
  isLoadingDemo: boolean;
  onLoadDemoFiles: () => void;
  queueCount: number;
}

export const AudioFolderUploader: React.FC<AudioFolderUploaderProps> = ({
  onAddFiles,
  isLoadingDemo,
  onLoadDemoFiles,
  queueCount,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (!e.dataTransfer) return;

    setIsProcessingFiles(true);
    try {
      let files: File[] = [];
      if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
        files = await extractFilesFromDataTransfer(e.dataTransfer.items);
      } else if (e.dataTransfer.files) {
        files = Array.from(e.dataTransfer.files).filter((f) => isAudioFile(f.name));
      }

      if (files.length > 0) {
        const items = await Promise.all(files.map((f) => createFileItem(f)));
        onAddFiles(items);
      }
    } catch (err) {
      console.error('Error handling dropped files:', err);
    } finally {
      setIsProcessingFiles(false);
    }
  };

  const handleFolderSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setIsProcessingFiles(true);
    try {
      const audioFiles = Array.from(e.target.files).filter((f) => isAudioFile(f.name));
      const items = await Promise.all(audioFiles.map((f) => createFileItem(f)));
      onAddFiles(items);
    } catch (err) {
      console.error('Error selecting folder:', err);
    } finally {
      setIsProcessingFiles(false);
      if (folderInputRef.current) folderInputRef.current.value = '';
    }
  };

  const handleFilesSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setIsProcessingFiles(true);
    try {
      const audioFiles = Array.from(e.target.files).filter((f) => isAudioFile(f.name));
      const items = await Promise.all(audioFiles.map((f) => createFileItem(f)));
      onAddFiles(items);
    } catch (err) {
      console.error('Error selecting files:', err);
    } finally {
      setIsProcessingFiles(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="w-full">
      {/* Hidden inputs */}
      <input
        type="file"
        ref={folderInputRef}
        onChange={handleFolderSelect}
        // @ts-ignore
        webkitdirectory="true"
        // @ts-ignore
        directory="true"
        multiple
        className="hidden"
      />
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFilesSelect}
        accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac,.webm,.opus"
        multiple
        className="hidden"
      />

      {/* Modern Studio Dropzone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative rounded-2xl border transition-all duration-300 ${
          isDragging
            ? 'border-amber-400 bg-amber-500/10 shadow-2xl shadow-amber-500/10'
            : 'border-slate-800 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-900/80'
        } p-8 sm:p-10`}
      >
        <div className="flex flex-col items-center max-w-2xl mx-auto text-center">
          {/* Main Icon */}
          <div
            className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 transition-all duration-300 ${
              isDragging
                ? 'bg-amber-400 text-slate-950 scale-110'
                : 'bg-slate-800/80 text-amber-400 border border-slate-700/80 shadow-inner'
            }`}
          >
            {isProcessingFiles ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : isDragging ? (
              <UploadCloud className="w-6 h-6 animate-bounce" />
            ) : (
              <FolderUp className="w-6 h-6" />
            )}
          </div>

          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white mb-2">
            Upload Audio Folder for Batch Subtitle Export
          </h2>

          <p className="text-sm text-slate-400 mb-6 max-w-lg leading-relaxed">
            Drop an audio folder to automatically detect spoken languages, transcribe speech, and export subtitle files translated to Khmer (<span className="text-amber-300 font-khmer">ភាសាខ្មែរ</span>) with identical matching filenames.
          </p>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-3 w-full">
            <button
              type="button"
              onClick={() => folderInputRef.current?.click()}
              disabled={isProcessingFiles}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-semibold text-xs tracking-wide shadow-md transition-all cursor-pointer disabled:opacity-50"
            >
              <FolderOpen className="w-4 h-4" />
              <span>Select Audio Folder</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessingFiles}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-medium text-xs border border-slate-700 transition-all cursor-pointer disabled:opacity-50"
            >
              <FileAudio className="w-4 h-4 text-slate-400" />
              <span>Individual Files</span>
            </button>

            <button
              type="button"
              onClick={onLoadDemoFiles}
              disabled={isLoadingDemo || isProcessingFiles}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-amber-300 hover:text-amber-200 font-medium text-xs border border-amber-500/30 hover:border-amber-400/50 transition-all cursor-pointer disabled:opacity-50"
            >
              {isLoadingDemo ? (
                <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
              ) : (
                <Sparkles className="w-4 h-4 text-amber-400" />
              )}
              <span>Load 3 Demo Samples</span>
            </button>
          </div>

          {/* Clean unboxed metadata separator: Zero-Pill discipline */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-500 font-mono-code">
            <span>MP3</span>
            <span aria-hidden="true">·</span>
            <span>WAV</span>
            <span aria-hidden="true">·</span>
            <span>M4A</span>
            <span aria-hidden="true">·</span>
            <span>AAC</span>
            <span aria-hidden="true">·</span>
            <span>OGG</span>
            <span aria-hidden="true">·</span>
            <span>FLAC</span>
            <span aria-hidden="true">·</span>
            <span>WEBM</span>
          </div>
        </div>
      </div>
    </div>
  );
};

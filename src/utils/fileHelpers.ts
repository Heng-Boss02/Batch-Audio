import { AudioFileItem } from '../types';

export const SUPPORTED_AUDIO_EXTENSIONS = [
  'mp3',
  'wav',
  'm4a',
  'aac',
  'ogg',
  'flac',
  'webm',
  'opus',
  'wma',
  'm4b',
];

export function isAudioFile(fileName: string): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  return SUPPORTED_AUDIO_EXTENSIONS.includes(ext);
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatSecondsToTime(sec: number): string {
  if (!sec || isNaN(sec)) return '00:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
}

/**
 * Extract audio duration using HTMLAudioElement
 */
export async function getAudioDuration(file: File | string): Promise<number> {
  return new Promise((resolve) => {
    const audio = new Audio();
    const url = typeof file === 'string' ? file : URL.createObjectURL(file);
    audio.preload = 'metadata';

    const cleanUp = () => {
      if (typeof file !== 'string') {
        URL.revokeObjectURL(url);
      }
    };

    audio.onloadedmetadata = () => {
      const dur = audio.duration;
      cleanUp();
      resolve(isFinite(dur) ? dur : 0);
    };

    audio.onerror = () => {
      cleanUp();
      resolve(0);
    };

    audio.src = url;
  });
}

/**
 * Traverse directories recursively from drag-and-drop DataTransferItemList
 */
export async function extractFilesFromDataTransfer(
  items: DataTransferItemList
): Promise<File[]> {
  const files: File[] = [];

  async function traverseEntry(entry: any, path = ''): Promise<void> {
    if (!entry) return;

    if (entry.isFile) {
      return new Promise((resolve) => {
        entry.file((file: File) => {
          if (isAudioFile(file.name)) {
            // attach relative path if available
            Object.defineProperty(file, 'webkitRelativePath', {
              value: path ? `${path}/${file.name}` : file.name,
              writable: false,
            });
            files.push(file);
          }
          resolve();
        });
      });
    } else if (entry.isDirectory) {
      const dirReader = entry.createReader();
      return new Promise((resolve) => {
        const readEntries = () => {
          dirReader.readEntries(async (entries: any[]) => {
            if (entries.length === 0) {
              resolve();
            } else {
              const currentPath = path ? `${path}/${entry.name}` : entry.name;
              for (const child of entries) {
                await traverseEntry(child, currentPath);
              }
              readEntries();
            }
          });
        };
        readEntries();
      });
    }
  }

  const entries: any[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.webkitGetAsEntry) {
      const entry = item.webkitGetAsEntry();
      if (entry) entries.push(entry);
    } else if (item.kind === 'file') {
      const file = item.getAsFile();
      if (file && isAudioFile(file.name)) {
        files.push(file);
      }
    }
  }

  for (const entry of entries) {
    await traverseEntry(entry);
  }

  return files;
}

/**
 * Convert File object to AudioFileItem state
 */
export async function createFileItem(file: File): Promise<AudioFileItem> {
  const url = URL.createObjectURL(file);
  const duration = await getAudioDuration(file);

  return {
    id: `audio_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    file,
    fileName: file.name,
    fileSize: file.size,
    folderPath: file.webkitRelativePath || undefined,
    mimeType: file.type || 'audio/mp3',
    audioUrl: url,
    duration,
    status: 'idle',
    progress: 0,
    cues: [],
  };
}

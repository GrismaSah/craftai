export interface FileItem {
  name: string;
  type: 'file' | 'folder';
  children?: FileItem[];
  content?: string;
  path: string;
  status?: 'streaming' | 'complete';
}

export interface FileViewerProps {
  file: FileItem | null;
  onClose: () => void;
}
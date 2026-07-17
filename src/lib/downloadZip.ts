import { FileItem } from '@/types/types';

export async function downloadProjectAsZip(files: FileItem[], projectName: string = 'project') {
  try {
    // Load JSZip from CDN if not already loaded
    if (!(window as any).JSZip) {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load JSZip'));
        document.head.appendChild(script);
      });
    }

    // Get JSZip - it's a constructor function from the library
    const JSZip = (window as any).JSZip;

    // Create zip instance
    const zip = new JSZip();

    // Recursively add files to zip
    const addFilesToZip = (items: FileItem[], zipFolder: any) => {
      items.forEach((item) => {
        if (item.type === 'folder' && item.children) {
          const folder = zipFolder.folder(item.name);
          addFilesToZip(item.children, folder);
        } else if (item.type === 'file') {
          zipFolder.file(item.name, item.content || '');
        }
      });
    };

    addFilesToZip(files, zip);

    // Generate ZIP and download
    const blob = await zip.generateAsync({ type: 'blob' });
    downloadBlob(blob, `${projectName}.zip`);
  } catch (error) {
    console.error('Error downloading project:', error);
    alert('Failed to download project. Please try again.');
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

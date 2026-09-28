import { api } from './api';

const fileNameFromHeader = (header: string | undefined, fallback: string) => {
  const star = header?.match(/filename\*=UTF-8''([^;]+)/i);
  if (star) return decodeURIComponent(star[1]);
  const plain = header?.match(/filename="?([^";]+)"?/i);
  return plain?.[1] ?? fallback;
};

const fetchBlob = async (url: string) => {
  const res = await api.get<Blob>(url, { responseType: 'blob' });
  return { blob: res.data, fileName: res.headers['content-disposition'] as string | undefined };
};

/**
 * Downloads a protected file. Files are served only to authenticated users,
 * so a plain <a href> would not carry the bearer token — fetch as a blob instead.
 */
export const downloadFile = async (url: string, fallbackName: string) => {
  const { blob, fileName } = await fetchBlob(url);
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileNameFromHeader(fileName, fallbackName);
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
};

/** Opens a protected file (PDF/image) in a new tab. */
export const openFile = async (url: string) => {
  // Open the tab synchronously (inside the click) so popup blockers allow it.
  const tab = window.open('', '_blank');
  try {
    const { blob } = await fetchBlob(url);
    const objectUrl = URL.createObjectURL(blob);
    if (tab) tab.location.href = objectUrl;
    else window.location.href = objectUrl;
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  } catch (error) {
    tab?.close();
    throw error;
  }
};

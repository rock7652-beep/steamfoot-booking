'use client';
import { useEffect, useRef, useState } from 'react';
type DownloadProps = { href: string; label?: string; ariaLabel?: string };
class PdfDownloadError extends Error {}
/** A changed record/store URL unmounts and cancels the previous request. */
export function CourseAgreementDownload(props: DownloadProps) {
  return <DownloadRequest key={props.href} {...props} />;
}
function DownloadRequest({ href, label = '下載 PDF', ariaLabel }: DownloadProps) {
  const [pending, setPending] = useState(false), [error, setError] = useState('');
  const busy = useRef(false), active = useRef(true), controller = useRef<AbortController | null>(null);
  useEffect(() => { active.current = true; return () => { active.current = false; controller.current?.abort(); }; }, []);
  async function download() {
    if (busy.current) return;
    busy.current = true; setPending(true); setError('');
    const request = new AbortController(); controller.current = request;
    try {
      const response = await fetch(href, { credentials: 'same-origin', cache: 'no-store', signal: request.signal });
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        const message = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string' ? body.error.slice(0,300) : '暫時無法下載 PDF，請稍後再試';
        throw new PdfDownloadError(message);
      }
      if (!response.headers.get('content-type')?.startsWith('application/pdf')) throw new PdfDownloadError('暫時無法下載 PDF，請重新登入後再試');
      const blob = await response.blob();
      if (!active.current || request.signal.aborted) return;
      if (!blob.size) throw new PdfDownloadError('暫時無法下載 PDF，請稍後再試');
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = response.headers.get('content-disposition')?.match(/filename="([a-zA-Z0-9_.-]+)"/)?.[1] ?? 'course-agreement.pdf';
      document.body.append(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) {
      if (active.current && !request.signal.aborted) setError(reason instanceof PdfDownloadError ? reason.message : '連線暫時中斷，請重試下載 PDF');
    } finally {
      busy.current = false;
      if (active.current) setPending(false);
    }
  }
  return <span className="inline-flex min-w-0 flex-col items-start gap-1 print:hidden"><button type="button" aria-label={ariaLabel} disabled={pending} onClick={() => void download()} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-earth-300 px-3 py-2 text-sm text-primary-800 disabled:opacity-50">{pending ? '準備 PDF…' : label}</button>{error && <span role="alert" className="max-w-xs whitespace-normal text-sm text-red-700">{error}</span>}</span>;
}

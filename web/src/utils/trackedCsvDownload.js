export async function trackedCsvDownload(url, filename, onProgress, {signal} = {}) {
    const id = window.crypto.randomUUID();
    const target = new URL(url, window.location.origin);
    target.searchParams.set('downloadId', id);
    onProgress({status: 'preparing', rows: 0, bytes: 0});
    const link = document.createElement('a');
    link.href = target.toString();
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    const started = Date.now();
    while (Date.now() - started < 30 * 60 * 1000) {
        if (signal?.aborted) throw new DOMException('Progress tracking cancelled', 'AbortError');
        const response = await fetch(`/api/downloads/${id}/progress`, {cache: 'no-store', credentials: 'include', signal});
        if (response.ok) {
            const progress = await response.json();
            onProgress(progress);
            if (progress.status === 'complete') return progress;
            if (progress.status === 'error') throw new Error(progress.message || 'Download failed. Please retry.');
        } else if (response.status !== 404 || Date.now() - started > 15000) {
            throw new Error('The download did not start. Check browser download permissions and retry.');
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw new Error('Progress tracking timed out. Check browser Downloads.');
}

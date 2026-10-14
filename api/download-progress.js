const downloads = new Map();
const ttl = 30 * 60 * 1000;
const validId = id => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
function startDownload(id) {
  if (!validId(id)) return null;
  for (const [key, value] of downloads) if (Date.now() - value.updatedAt > ttl) downloads.delete(key);
  if (downloads.has(id)) return null;
  if (downloads.size >= 1000) downloads.delete(downloads.keys().next().value);
  const progress = {status: 'preparing', rows: 0, bytes: 0, updatedAt: Date.now()};
  downloads.set(id, progress);
  return progress;
}
function updateDownload(progress, changes) {
  if (progress) Object.assign(progress, changes, {updatedAt: Date.now()});
}
function progressHandler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const progress = validId(req.params.downloadId) && downloads.get(req.params.downloadId);
  if (!progress || Date.now() - progress.updatedAt > ttl) return res.status(404).json({message: 'Download not found'});
  res.json(progress);
}
module.exports = {startDownload, updateDownload, progressHandler};

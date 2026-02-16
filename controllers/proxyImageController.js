/**
 * Proxy images from Azure Blob Storage so the frontend can load them without CORS/403.
 * Uses backend credentials to stream the blob to the client.
 * @route GET /upload/proxy-image?url=<encoded-azure-blob-url>
 */

const { BlobServiceClient } = require('@azure/storage-blob');

const AZURE_BLOB_HOST = 'blob.core.windows.net';

/**
 * Parse an Azure Blob URL into container and blob name.
 * e.g. https://opeecstorage.blob.core.windows.net/images/1770662834032_15540789_21438.jpg
 * @returns { { container: string, blobName: string } | null }
 */
function parseAzureBlobUrl(urlString) {
  try {
    const url = new URL(urlString);
    if (url.protocol !== 'https:' || !url.hostname.endsWith(AZURE_BLOB_HOST)) {
      return null;
    }
    const pathParts = url.pathname.replace(/^\/+/, '').split('/').filter(Boolean);
    if (pathParts.length < 2) return null;
    const container = pathParts[0];
    const blobName = pathParts.slice(1).join('/');
    return { container, blobName };
  } catch {
    return null;
  }
}

/**
 * Stream Azure Blob to response. Only allows our storage account (from env).
 */
module.exports.proxyImage = async (req, res) => {
  try {
    const rawUrl = req.query.url;
    if (!rawUrl || typeof rawUrl !== 'string') {
      return res.status(400).json({ message: 'Missing or invalid url query parameter.' });
    }

    const decodedUrl = decodeURIComponent(rawUrl.trim());
    const parsed = parseAzureBlobUrl(decodedUrl);
    if (!parsed) {
      return res.status(400).json({ message: 'Invalid Azure Blob URL. Only blob.core.windows.net URLs are allowed.' });
    }

    const connectionString = process.env.AZURE_CONNECTION_STRING;
    if (!connectionString) {
      return res.status(503).json({ message: 'Image proxy not configured.' });
    }

    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    const containerClient = blobServiceClient.getContainerClient(parsed.container);
    const blockBlobClient = containerClient.getBlockBlobClient(parsed.blobName);

    const downloadResponse = await blockBlobClient.download();
    if (!downloadResponse.readableStreamBody) {
      return res.status(404).json({ message: 'Blob not found.' });
    }

    const contentType = downloadResponse.contentType || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    downloadResponse.readableStreamBody.pipe(res);
  } catch (err) {
    console.error('Proxy image error:', err);
    if (res.headersSent) return;
    if (err.code === 'BlobNotFound') {
      return res.status(404).json({ message: 'Image not found.' });
    }
    res.status(500).json({ message: 'Failed to load image.' });
  }
};

const { BlobServiceClient } = require('@azure/storage-blob');
const path = require('path');

module.exports.uploadToAzure = async (filePath, containerName) => {
    const connectionString = process.env.AZURE_CONNECTION_STRING;
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blobName = path.basename(filePath);
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    const uploadBlobResponse = await blockBlobClient.uploadFile(filePath);
    console.log(`Blob was uploaded successfully. requestId: ${uploadBlobResponse.requestId}`);

    return blockBlobClient.url;
};

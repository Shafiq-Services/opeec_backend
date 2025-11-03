const { sanitizeBlobName } = require("./sanitizeBlob");
const { BlobServiceClient } = require("@azure/storage-blob");
const { fork } = require('child_process');
const path = require('path');


// Upload image to Azure Blob Storage
module.exports.uploadImage = async (containerName, file) => {
  try {
    //Azure
    const connectionString = process.env.AZURE_CONNECTION_STRING;

    const blobServiceClient =
      BlobServiceClient.fromConnectionString(connectionString);
    const containerClient = blobServiceClient.getContainerClient(
      containerName
    );

    // Generate a unique blob name for the uploaded image
    const blobName = `${Date.now()}_${sanitizeBlobName(file.originalname)}`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    // Upload the image to Azure Blob Storage
    await blockBlobClient.upload(file.buffer, file.buffer.length);

    //Response
    return {
      url: blockBlobClient.url,
    };
  } catch (error) {
    return { errors: error };
  }
};

// Upload multiple images to Azure Blob Storage
module.exports.uploadImages = async (containerName, files) => {
  try {
    const connectionString = process.env.AZURE_CONNECTION_STRING;
    if (!connectionString) {

      throw new Error('Azure connection string is not set.');
    }

    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);

    const containerClient = blobServiceClient.getContainerClient(containerName);

    let uploadedFiles = [];

    for (let file of files) {
      const blobName = `${Date.now()}_${Math.random().toString().substr(2, 8)}_${sanitizeBlobName(file.originalname)}`;


      const blockBlobClient = containerClient.getBlockBlobClient(blobName);


      await blockBlobClient.upload(file.buffer, file.buffer.length);


      uploadedFiles.push(blockBlobClient.url);

    }

    return uploadedFiles;
  } catch (error) {
    return { errors: error };
  }
};

// Upload video to Azure Blob Storage
module.exports.uploadVideo = (containerName, file) => {
  return new Promise((resolve, reject) => {
    if (file === undefined) {
      reject({ statusCode: 400, message: 'No video file uploaded.' });
      return;
    }

    const videoFile = file;
    const worker = fork(path.join(__dirname, '..', 'Workers', 'videoProcessor.js'));

    worker.on('message', (message) => {
      resolve({ statusCode: message.statusCode, message: message.text, url: message.url });
    });

    worker.on('error', err => {
      console.error('Worker error:', err);
      reject({ statusCode: 500, message: 'Failed to process video.' });
    });

    worker.send({ video: videoFile, containerName: containerName });
  });
};
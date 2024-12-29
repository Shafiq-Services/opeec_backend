const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const { uploadToAzure } = require('../Utils/videoBlob');
ffmpeg.setFfmpegPath(require('@ffmpeg-installer/ffmpeg').path);

process.on('message', async ({ video, containerName }) => {
    try {
        const tempFilePath = video.tempFilePath;
        const outputFilePath = tempFilePath + '.mp4'; 

        // Process video with ffmpeg
        await new Promise((resolve, reject) => {
            ffmpeg(tempFilePath)
                .outputFormat('mp4')
                .on('end', resolve)
                .on('error', (err, stdout, stderr) => reject(new Error(err.message)))
                .save(outputFilePath);
        });

        // Upload processed video to Azure
        const url = await uploadToAzure(outputFilePath, containerName);

        // Clean up temporary files
        fs.unlinkSync(tempFilePath);
        fs.unlinkSync(outputFilePath);

        process.send({ statusCode: 200, text: 'Video uploaded successfully', url });
    } catch (error) {
        console.error('Error processing video:', error);
        process.send({ statusCode: 500, text: 'Error processing video' });
    }
});

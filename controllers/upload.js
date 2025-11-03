const { uploadImages, uploadVideo, uploadDocument, uploadAudio } = require('../utils/upload');

/**
 * @description This will upload the images for the post
 * @route POST /api/crime/upload/images
 * @access Private
 */

module.exports.uploadImages = async (req, res) => {
    try {
        const files = req.files;
        const imageUrls = await uploadImages('images', files);
        if (!imageUrls || imageUrls.errors) {
            throw new Error('Failed to upload images');
        }
        return res.status(200).json({

            success: true,
            message: 'Image uploaded successfully',
            imageUrls
        });
    } catch (error) {
        return res.status(500).json({
            errors: error.message,
            success: false,
            message: 'Internal server error'
        });
    }
}

/**
 * @description This will upload the video for the post
 * @route POST /api/crime/upload/video
 * @access Private
 */

module.exports.uploadVideo = async (req, res) => {
    try {

        if (!req.files || !req.files.video) {
            return res.status(400).send('No video file uploaded.');
        }
        const video = req.files.video;
        const { url } = await uploadVideo('videos', video);
        if (!url) throw new Error('Failed to upload video');
        return res.status(200).json({
            success: true,
            message: 'Video uploaded successfully',
            url
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
}

/**
 * @description This will upload the document for the post
 * @route POST /api/crime/upload/document
 * @access Private
 */

module.exports.uploadDocument = async (req, res) => {
    try {
        const document = req.file;
        if (!document) return res.status(400).send('No document file uploaded.');
        const url = await uploadDocument('documnets-circle', document);
        if (!url) throw new Error('Failed to upload document');
        return res.status(200).json({
            success: true,
            message: 'Document uploaded successfully',
            url
        });
    } catch (error) {
        console.error('Upload Document Error:', error);
        const errorMessage = error.errors ? error.errors.message : error.message;
        return res.status(500).json({
            errors: errorMessage,
            success: false,
            message: 'Internal server error'
        });
    }
};

/**
 * @description This will upload the audio for the post
 * @route POST /api/crime/upload/audio
 * @access Private
 */

module.exports.uploadAudio = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send('No audio file uploaded.');
    }
    const audio = req.file;
    const url = await uploadAudio('voice-circle', audio);
    if (!url) throw new Error('Failed to upload audio');
    return res.status(200).json({
      success: true,
      message: 'Audio uploaded successfully',
      url
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      errors: error.message,
    });
  }
};


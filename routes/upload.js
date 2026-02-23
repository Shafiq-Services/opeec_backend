const router = require("express").Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const fileUpload = require('express-fileupload');

// Controllers
const { 
    uploadImages, 
    uploadVideo
} = require('../controllers/upload');
const { proxyImage } = require('../controllers/proxyImageController');

// Middlewares

router.get('/proxy-image', proxyImage);
router.post('/images', upload.array('images', 10), uploadImages);
router.post('/videos', fileUpload({ useTempFiles: true, tempFileDir: '/tmp/' }), uploadVideo);

module.exports = router;

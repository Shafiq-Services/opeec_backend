const router = require("express").Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const fileUpload = require('express-fileupload');

// Controllers
const { 
    uploadImages, 
    uploadVideo
} = require('../controllers/upload');

// Middlewares

router.post('/images', upload.array('images', 10), uploadImages);
router.post('/videos', fileUpload({ useTempFiles: true, tempFileDir: '/tmp/' }), uploadVideo);

module.exports = router;

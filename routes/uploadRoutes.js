const express = require('express');
const router = express.Router();
const multer = require('multer');
const uploadController = require('../controllers/uploadController');

// Use memory storage so files are available in req.files
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Route to handle POST uploads (expecting 'promptFile' and 'topicsFile')
router.post(
  '/',
  upload.fields([
    { name: 'promptFile', maxCount: 1 },
    { name: 'topicsFile', maxCount: 1 }
  ]),
  uploadController.generateOutputFromUpload
);

module.exports = router;

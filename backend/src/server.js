// /phrase-search-app/backend/src/server.js

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const multer = require('multer');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const srtParser = require('subtitles-parser'); // Add this to package.json

const app = express();
app.use(cors());
app.use(express.json());

// Configure storage for uploaded files
const storage = multer.diskStorage({
  destination: './uploads/',
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

// Ensure uploads directory exists
if (!fs.existsSync('./uploads')){
    fs.mkdirSync('./uploads');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Upload video with subtitles
app.post('/api/upload', upload.fields([
  { name: 'video', maxCount: 1 },
  { name: 'subtitles', maxCount: 1 }
]), async (req, res) => {
  try {
    const videoFile = req.files['video'][0];
    const subtitlesFile = req.files['subtitles'][0];
    
    // Read and parse SRT file
    const srtData = fs.readFileSync(subtitlesFile.path, 'utf8');
    const parsedSubs = srtParser.fromSrt(srtData);
    
    // Start a database transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Insert video info
      const videoResult = await client.query(
        'INSERT INTO videos (filename, original_name) VALUES ($1, $2) RETURNING id',
        [videoFile.filename, videoFile.originalname]
      );
      const videoId = videoResult.rows[0].id;
      
      // Insert subtitles
      for (const sub of parsedSubs) {
        await client.query(
          'INSERT INTO subtitles (video_id, text, start_time, end_time) VALUES ($1, $2, $3, $4)',
          [videoId, sub.text, sub.startTime, sub.endTime]
        );
      }
      
      await client.query('COMMIT');
      res.json({ 
        message: 'Upload successful',
        videoId: videoId
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Enhanced search endpoint
app.post('/api/search', async (req, res) => {
  const { phrase, exact = false } = req.body;
  try {
    const query = `
      SELECT s.*, v.filename, v.original_name 
      FROM subtitles s
      JOIN videos v ON s.video_id = v.id
      WHERE s.text ${exact ? '=' : 'ILIKE'} $1
      ORDER BY v.id, s.start_time
    `;
    const results = await pool.query(query, [exact ? phrase : `%${phrase}%`]);
    res.json(results.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Stream video segment
app.get('/api/video/:videoId/:startTime', (req, res) => {
  const { videoId, startTime } = req.params;
  // Add video streaming logic here
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

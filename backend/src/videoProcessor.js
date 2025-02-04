// /phrase-search-app/backend/src/videoProcessor.js
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const srtParser = require('subtitles-parser');
const { parse: vttParse } = require('webvtt-parser'); // Add to package.json

class VideoProcessor {
  constructor(uploadPath = './uploads', cachePath = './cache') {
    this.uploadPath = uploadPath;
    this.cachePath = cachePath;
    this.ensureDirectories();
  }

  ensureDirectories() {
    [this.uploadPath, this.cachePath].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  async processVideo(videoFile, subtitleFile) {
    const videoInfo = await this.getVideoInfo(videoFile.path);
    const segments = await this.splitVideo(videoFile.path, videoInfo);
    const subtitles = await this.parseSubtitles(subtitleFile);
    
    return {
      videoInfo,
      segments,
      subtitles
    };
  }

  getVideoInfo(videoPath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) reject(err);
        resolve({
          duration: metadata.format.duration,
          bitrate: metadata.format.bit_rate,
          resolution: {
            width: metadata.streams[0].width,
            height: metadata.streams[0].height
          }
        });
      });
    });
  }

  async splitVideo(videoPath, videoInfo) {
    const segmentDuration = 10; // 10-second segments
    const segments = [];
    
    for (let start = 0; start < videoInfo.duration; start += segmentDuration) {
      const segmentPath = path.join(this.cachePath, `segment_${start}.mp4`);
      await this.createSegment(videoPath, start, segmentDuration, segmentPath);
      segments.push({
        start,
        duration: Math.min(segmentDuration, videoInfo.duration - start),
        path: segmentPath
      });
    }
    
    return segments;
  }

  createSegment(videoPath, start, duration, outputPath) {
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .setStartTime(start)
        .setDuration(duration)
        .output(outputPath)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });
  }

  async parseSubtitles(subtitleFile) {
    const content = fs.readFileSync(subtitleFile.path, 'utf8');
    const extension = path.extname(subtitleFile.originalname).toLowerCase();
    
    switch (extension) {
      case '.srt':
        return this.parseSRT(content);
      case '.vtt':
        return this.parseVTT(content);
      default:
        throw new Error('Unsupported subtitle format');
    }
  }

  parseSRT(content) {
    return srtParser.fromSrt(content);
  }

  parseVTT(content) {
    const parser = new vttParse();
    const tree = parser.parse(content, 'metadata');
    
    return tree.cues.map(cue => ({
      id: cue.id,
      startTime: cue.startTime * 1000,
      endTime: cue.endTime * 1000,
      text: cue.text
    }));
  }

  generateThumbnail(videoPath, timestamp) {
    const thumbnailPath = path.join(this.cachePath, `thumb_${Date.now()}.jpg`);
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .screenshots({
          timestamps: [timestamp],
          filename: path.basename(thumbnailPath),
          folder: path.dirname(thumbnailPath),
          size: '320x240'
        })
        .on('end', () => resolve(thumbnailPath))
        .on('error', reject);
    });
  }

  cleanupOldCache() {
    // Remove cache files older than 24 hours
    const files = fs.readdirSync(this.cachePath);
    const yesterday = Date.now() - 24 * 60 * 60 * 1000;
    
    files.forEach(file => {
      const filePath = path.join(this.cachePath, file);
      const stats = fs.statSync(filePath);
      
      if (stats.mtimeMs < yesterday) {
        fs.unlinkSync(filePath);
      }
    });
  }
}

module.exports = VideoProcessor;

// /phrase-search-app/backend/src/server.js - Updated streaming endpoints
const VideoProcessor = require('./videoProcessor');
const processor = new VideoProcessor();

// Stream video segment
app.get('/api/video/:videoId/:timestamp', async (req, res) => {
  try {
    const { videoId, timestamp } = req.params;
    const video = await pool.query('SELECT filename FROM videos WHERE id = $1', [videoId]);
    
    if (!video.rows.length) {
      return res.status(404).json({ error: 'Video not found' });
    }

    const videoPath = path.join(processor.uploadPath, video.rows[0].filename);
    const range = req.headers.range;
    
    if (!range) {
      res.status(400).json({ error: 'Requires range header' });
      return;
    }

    const videoSize = fs.statSync(videoPath).size;
    const CHUNK_SIZE = 10 ** 6; // 1MB
    const start = Number(range.replace(/\D/g, ''));
    const end = Math.min(start + CHUNK_SIZE, videoSize - 1);
    
    const contentLength = end - start + 1;
    const headers = {
      'Content-Range': `bytes ${start}-${end}/${videoSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': contentLength,
      'Content-Type': 'video/mp4',
    };

    res.writeHead(206, headers);
    const videoStream = fs.createReadStream(videoPath, { start, end });
    videoStream.pipe(res);
  } catch (error) {
    console.error('Streaming error:', error);
    res.status(500).json({ error: 'Streaming failed' });
  }
});

// Generate thumbnail
app.get('/api/thumbnail/:videoId/:timestamp', async (req, res) => {
  try {
    const { videoId, timestamp } = req.params;
    const video = await pool.query('SELECT filename FROM videos WHERE id = $1', [videoId]);
    
    if (!video.rows.length) {
      return res.status(404).json({ error: 'Video not found' });
    }

    const videoPath = path.join(processor.uploadPath, video.rows[0].filename);
    const thumbnailPath = await processor.generateThumbnail(videoPath, timestamp);
    
    res.sendFile(thumbnailPath);
  } catch (error) {
    console.error('Thumbnail generation error:', error);
    res.status(500).json({ error: 'Thumbnail generation failed' });
  }
});

// Enhanced upload endpoint
app.post('/api/upload', upload.fields([
  { name: 'video', maxCount: 1 },
  { name: 'subtitles', maxCount: 1 }
]), async (req, res) => {
  try {
    const videoFile = req.files['video'][0];
    const subtitlesFile = req.files['subtitles'][0];
    
    const processedData = await processor.processVideo(videoFile, subtitlesFile);
    
    // Start a database transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      const videoResult = await client.query(
        `INSERT INTO videos (filename, original_name, duration, resolution) 
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [
          videoFile.filename,
          videoFile.originalname,
          processedData.videoInfo.duration,
          JSON.stringify(processedData.videoInfo.resolution)
        ]
      );
      
      const videoId = videoResult.rows[0].id;
      
      // Insert subtitles and segments
      for (const sub of processedData.subtitles) {
        await client.query(
          `INSERT INTO subtitles (video_id, text, start_time, end_time) 
           VALUES ($1, $2, $3, $4)`,
          [videoId, sub.text, sub.startTime, sub.endTime]
        );
      }
      
      for (const segment of processedData.segments) {
        await client.query(
          `INSERT INTO video_segments (video_id, start_time, duration, path) 
           VALUES ($1, $2, $3, $4)`,
          [videoId, segment.start, segment.duration, segment.path]
        );
      }
      
      await client.query('COMMIT');
      
      // Clean up old cache files
      processor.cleanupOldCache();
      
      res.json({ 
        message: 'Upload and processing successful',
        videoId: videoId,
        info: processedData.videoInfo
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Upload/processing error:', error);
    res.status(500).json({ error: 'Upload/processing failed' });
  }
});

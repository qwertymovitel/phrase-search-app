-- /phrase-search-app/database/init.sql

CREATE TABLE videos (
    id SERIAL PRIMARY KEY,
    filename VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    duration FLOAT NOT NULL,
    resolution JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE video_segments (
    id SERIAL PRIMARY KEY,
    video_id INTEGER REFERENCES videos(id),
    start_time FLOAT NOT NULL,
    duration FLOAT NOT NULL,
    path VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE subtitles (
    id SERIAL PRIMARY KEY,
    video_id INTEGER REFERENCES videos(id),
    text TEXT NOT NULL,
    start_time INTEGER NOT NULL,
    end_time INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add full text search capabilities
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_subtitles_text_trgm ON subtitles USING gin(text gin_trgm_ops);

-- Add timestamp-based search optimization
CREATE INDEX idx_subtitles_time ON subtitles(video_id, start_time, end_time);

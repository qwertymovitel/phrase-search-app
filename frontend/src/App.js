// /phrase-search-app/frontend/src/App.js

import React, { useState } from 'react';
import { Upload, Search, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

const App = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  const handleUpload = async (event) => {
    const videoFile = event.target.files[0];
    const subtitleFile = event.target.files[1];
    
    if (!videoFile || !subtitleFile) {
      setError('Please select both video and subtitle files');
      return;
    }

    const formData = new FormData();
    formData.append('video', videoFile);
    formData.append('subtitles', subtitleFile);

    setUploading(true);
    try {
      const response = await fetch('http://localhost:4000/api/upload', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) throw new Error('Upload failed');
      
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSearch = async () => {
    try {
      const response = await fetch('http://localhost:4000/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phrase: searchQuery }),
      });
      
      const data = await response.json();
      setResults(data);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4">
      <h1 className="text-3xl font-bold mb-8">Phrase Search</h1>
      
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Upload New Content</h2>
        <div className="flex items-center gap-4">
          <Input
            type="file"
            multiple
            accept=".mp4,.srt"
            onChange={handleUpload}
            disabled={uploading}
          />
          <Button disabled={uploading}>
            <Upload className="w-4 h-4 mr-2" />
            {uploading ? 'Uploading...' : 'Upload'}
          </Button>
        </div>
      </div>

      <div className="mb-8">
        <div className="flex gap-2">
          <Input
            type="text"
            placeholder="Enter phrase to search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1"
          />
          <Button onClick={handleSearch}>
            <Search className="w-4 h-4 mr-2" />
            Search
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        {results.map((result) => (
          <Card key={result.id}>
            <CardContent className="p-4">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="text-lg font-semibold">{result.text}</p>
                  <p className="text-sm text-gray-600">
                    From: {result.original_name}
                  </p>
                </div>
                <Button variant="outline" size="sm">
                  <Play className="w-4 h-4 mr-2" />
                  Play
                </Button>
              </div>
              <p className="text-sm text-gray-500">
                Time: {Math.floor(result.start_time/1000)}s - 
                {Math.floor(result.end_time/1000)}s
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default App;

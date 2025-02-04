// /phrase-search-app/frontend/src/App.js

import React, { useState } from 'react';

function App() {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState([]);

  const handleSearch = async () => {
    try {
      const response = await fetch('http://localhost:4000/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ phrase: searchQuery }),
      });
      const data = await response.json();
      setResults(data);
    } catch (error) {
      console.error('Error:', error);
    }
  };

  return (
    <div className="App">
      <h1>Phrase Search</h1>
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Enter phrase to search"
      />
      <button onClick={handleSearch}>Search</button>
      <div>
        {results.map((result, index) => (
          <div key={index}>
            <p>{result.text}</p>
            <p>Time: {result.start_time} - {result.end_time}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
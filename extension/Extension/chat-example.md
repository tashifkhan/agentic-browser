# Chat API Example

## Backend Setup

1. Set your Gemini API key:
```bash
export GEMINI_API_KEY='your-gemini-api-key'
export GOOGLE_CLIENT_SECRET='your-google-secret'
```

2. Run the backend:
```bash
python backend_service.py
```

## Usage from Extension

### Simple Chat Request

```typescript
async function chatWithAI(message: string) {
  try {
    const response = await fetch('http://localhost:5000/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: message,
        model: 'gemini-1.5-flash', // optional, defaults to gemini-1.5-flash
      }),
    });

    const data = await response.json();
    
    if (data.success) {
      console.log('AI Response:', data.response);
      return data.response;
    } else {
      console.error('Error:', data.error);
      return null;
    }
  } catch (error) {
    console.error('Request failed:', error);
    return null;
  }
}

// Example usage
await chatWithAI('What is the capital of France?');
```

### Chat with Conversation History

```typescript
async function chatWithHistory(message: string, history: any[]) {
  try {
    const response = await fetch('http://localhost:5000/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: message,
        history: history,
        model: 'gemini-1.5-flash',
      }),
    });

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Request failed:', error);
    return null;
  }
}

// Example with conversation history
const conversationHistory = [
  { role: 'user', content: 'Hello, who are you?' },
  { role: 'model', content: 'I am Gemini, a helpful AI assistant.' },
  { role: 'user', content: 'What can you help me with?' },
  { role: 'model', content: 'I can help with various tasks like answering questions, writing code, and more.' },
];

await chatWithHistory('Can you summarize our conversation?', conversationHistory);
```

### React Component Example

```tsx
import React, { useState } from 'react';

function ChatComponent() {
  const [message, setMessage] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSendMessage = async () => {
    setLoading(true);
    try {
      const res = await fetch('http://localhost:5000/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: message,
          model: 'gemini-1.5-flash',
        }),
      });

      const data = await res.json();
      if (data.success) {
        setResponse(data.response);
      } else {
        setResponse('Error: ' + data.error);
      }
    } catch (error) {
      setResponse('Request failed: ' + error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <input
        type="text"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Ask me anything..."
      />
      <button onClick={handleSendMessage} disabled={loading}>
        {loading ? 'Sending...' : 'Send'}
      </button>
      {response && (
        <div>
          <h3>Response:</h3>
          <p>{response}</p>
        </div>
      )}
    </div>
  );
}
```

## API Response Format

**Success Response:**
```json
{
  "response": "The AI's response text",
  "model": "gemini-1.5-flash",
  "success": true
}
```

**Error Response:**
```json
{
  "error": "Error message",
  "success": false
}
```

## Available Models

- `gemini-1.5-flash` (default, faster)
- `gemini-1.5-pro` (more capable)
- `gemini-pro`


2# RAG-Based Conversation History Setup

## Installation

Install the new dependencies:

```bash
cd himanshu
pip install -r requirements.txt
```

This will install:
- `langchain-community` - Community integrations for LangChain
- `langchain-chroma` - ChromaDB vector store integration
- `chromadb` - Vector database for embeddings
- `sentence-transformers` - Fast embedding model (all-MiniLM-L6-v2)

## What's New

### 1. **Conversation History Manager**
Located at `generator/conversation_manager.py`

Features:
- Stores all user interactions with action plans
- Uses vector embeddings for semantic similarity search
- Retrieves relevant past successful interactions
- Provides context to LLM for better action generation

### 2. **Vector Storage**
- Uses ChromaDB (local, file-based vector database)
- Embeddings stored in `./data/chroma_db/`
- Fast similarity search using cosine similarity
- Lightweight model runs locally (no API needed)

### 3. **New API Endpoints**

#### POST `/update-result`
Updates execution result for learning
```json
{
  "result": {
    "success": true,
    "results": [...],
    "message": "All actions executed successfully"
  }
}
```

#### GET `/conversation-stats`
Get statistics about stored interactions
```json
{
  "ok": true,
  "stats": {
    "total_interactions": 15,
    "successful_interactions": 12,
    "current_session_length": 3,
    "session_id": "20251115_143022"
  }
}
```

#### POST `/clear-session`
Clear current session history

## How It Works

### 1. When User Generates Action Plan:
1. Extract goal and target URL
2. Search vector database for similar past interactions
3. Retrieve top 3 most relevant examples
4. Include them in LLM prompt as context
5. LLM generates better action plan based on past successes

### 2. When Actions Execute:
1. Frontend sends execution results back to server
2. Server stores interaction with success/failure info
3. Future similar requests benefit from this learning

### 3. Vector Search Example:
```
User Goal: "write a poem in text box"
URL: "https://web.whatsapp.com/"

Vector Search Returns:
- Previous interaction on WhatsApp (similarity: 0.95)
- Previous text input interaction (similarity: 0.82)
- Similar "write" task (similarity: 0.76)

LLM sees these examples and generates more accurate selectors!
```

## Benefits

✅ **Learning from Experience** - System gets better over time  
✅ **Site-Specific Knowledge** - Remembers successful patterns per website  
✅ **Semantic Similarity** - Finds relevant examples even with different wording  
✅ **Local Storage** - All data stored locally, no external API  
✅ **Fast Retrieval** - Vector search is very fast (~10ms)  
✅ **Privacy** - No data sent to external services  

## Usage

The system automatically:
- Stores every interaction
- Searches for relevant context
- Improves over time

You'll see in the response:
```
✅ Generated 2 action(s) successfully! (📚 Using 3 similar examples)
```

## Data Management

### View Statistics
Check the "AI Learning Stats" section in the UI

### Clear Data
```bash
# Delete vector database
rm -rf himanshu/data/chroma_db/
```

### Backup Data
```bash
# Backup vector database
cp -r himanshu/data/chroma_db/ backup/
```

## Troubleshooting

### First Time Setup
On first run, the embedding model will download (~80MB):
```
Downloading all-MiniLM-L6-v2...
```

### ChromaDB Errors
If you see ChromaDB errors, try:
```bash
pip install --upgrade chromadb
```

### Memory Issues
The system uses minimal memory (~200MB for embeddings).
If needed, reduce context retrieval:
```python
k=3  # Change to k=1 in conversation_manager.py
```

## Advanced Configuration

### Change Embedding Model
Edit `conversation_manager.py`:
```python
self.embeddings = HuggingFaceEmbeddings(
    model_name="all-mpnet-base-v2",  # More accurate but slower
    model_kwargs={'device': 'cpu'}
)
```

### Adjust Context Window
Edit `server.py`:
```python
relevant_context = conversation_manager.get_relevant_context(
    goal=goal,
    target_url=target_url,
    k=5  # Retrieve more examples
)
```

## Next Steps

The system will automatically improve as you use it. The more interactions you store, the better the action plans become!

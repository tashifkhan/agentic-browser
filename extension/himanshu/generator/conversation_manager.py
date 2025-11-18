"""
Conversation History Manager with RAG-based Vector Storage
Stores conversation history and retrieves relevant context using embeddings
Optimized with intelligent text splitting and chunking for better retrieval
"""
import os
import json
from datetime import datetime
from typing import List, Dict, Optional, Tuple
from collections import defaultdict

import faiss
from langchain_community.vectorstores import FAISS
from langchain_ollama import OllamaEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document


class ConversationManager:
    def __init__(self, persist_directory: str = "./data/faiss_db"):
        """Initialize conversation manager with vector storage and intelligent chunking"""
        self.persist_directory = persist_directory
        self.index_path = os.path.join(persist_directory, "index")
        
        # Initialize Ollama embeddings (runs locally)
        self.embeddings = OllamaEmbeddings(
            model="embeddinggemma:latest",  # Fast, efficient embedding model
            base_url="http://localhost:11434"  # Default Ollama URL
        )
        
        # Initialize text splitter for optimal chunking
        # Optimized for RAG: smaller chunks for better precision
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=500,  # Smaller chunks for precise retrieval
            chunk_overlap=100,  # Overlap to maintain context
            length_function=len,
            separators=["\n\n", "\n", ". ", " ", ""],  # Hierarchical splitting
            add_start_index=True,  # Track chunk position
        )
        
        # Initialize or load FAISS vector store
        os.makedirs(persist_directory, exist_ok=True)
        
        if os.path.exists(self.index_path):
            # Load existing index
            self.vectorstore = FAISS.load_local(
                self.index_path,
                self.embeddings,
                allow_dangerous_deserialization=True
            )
        else:
            # Create new empty index with a dummy document
            dummy_doc = Document(page_content="Initial document", metadata={})
            self.vectorstore = FAISS.from_documents([dummy_doc], self.embeddings)
        
        # In-memory conversation history (for current session)
        self.current_session: List[Dict] = []
        self.session_id = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        # Cache for interaction IDs to prevent duplicates
        self.interaction_ids = set()
    
    def add_interaction(
        self,
        goal: str,
        target_url: str,
        dom_structure: Dict,
        action_plan: Dict,
        result: Optional[Dict] = None
    ):
        """Add a user interaction to history and vector storage with intelligent chunking"""
        
        # Generate unique interaction ID
        interaction_id = f"{self.session_id}_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}"
        
        # Skip if duplicate
        if interaction_id in self.interaction_ids:
            return
        
        interaction = {
            "interaction_id": interaction_id,
            "session_id": self.session_id,
            "timestamp": datetime.now().isoformat(),
            "goal": goal,
            "target_url": target_url,
            "action_plan": action_plan,
            "result": result,
            "success": result.get("success") if result else None
        }
        
        # Add to current session
        self.current_session.append(interaction)
        self.interaction_ids.add(interaction_id)
        
        # Create multiple document chunks for better RAG retrieval
        documents = self._create_chunked_documents(interaction)
        
        # Add all chunks to vector store
        if documents:
            self.vectorstore.add_documents(documents)
            # Save the index to disk
            self.vectorstore.save_local(self.index_path)
    
    def _create_chunked_documents(self, interaction: Dict) -> List[Document]:
        """Create optimally chunked documents from interaction for better RAG"""
        documents = []
        
        goal = interaction["goal"]
        target_url = interaction["target_url"]
        action_plan = interaction["action_plan"]
        result = interaction.get("result")
        success = interaction.get("success")
        
        # Common metadata for all chunks
        base_metadata = {
            "interaction_id": interaction["interaction_id"],
            "session_id": interaction["session_id"],
            "timestamp": interaction["timestamp"],
            "goal": goal,
            "target_url": target_url,
            "success": str(success),
            "num_actions": len(action_plan.get('actions', [])),
        }
        
        # 1. Goal-focused chunk (primary for semantic search)
        goal_content = f"""Task Goal: {goal}
Target URL: {target_url}
Number of Actions: {len(action_plan.get('actions', []))}
Success: {success}

This interaction {'succeeded' if success else 'failed'} in accomplishing the goal."""
        
        documents.append(Document(
            page_content=goal_content,
            metadata={**base_metadata, "chunk_type": "goal_summary"}
        ))
        
        # 2. Action sequence chunk (for procedural matching)
        actions = action_plan.get('actions', [])
        if actions:
            action_types = [a.get('type', 'unknown') for a in actions]
            action_sequence = " → ".join(action_types)
            
            action_content = f"""Goal: {goal}
Action Sequence: {action_sequence}
Total Steps: {len(actions)}

Detailed Actions:
"""
            for i, action in enumerate(actions, 1):
                action_str = f"{i}. {action.get('type', 'unknown')}"
                if action.get('selector'):
                    action_str += f" (selector: {action['selector']})"
                if action.get('value'):
                    action_str += f" [value: {action['value'][:50]}...]" if len(str(action.get('value', ''))) > 50 else f" [value: {action['value']}]"
                action_content += action_str + "\n"
            
            # Split action content if too large
            action_chunks = self.text_splitter.split_text(action_content)
            for idx, chunk in enumerate(action_chunks):
                documents.append(Document(
                    page_content=chunk,
                    metadata={
                        **base_metadata, 
                        "chunk_type": "action_sequence",
                        "chunk_index": idx,
                        "total_chunks": len(action_chunks)
                    }
                ))
        
        # 3. Individual action chunks (for specific action matching)
        for idx, action in enumerate(actions[:10]):  # Limit to first 10 actions
            action_detail = f"""Goal Context: {goal}
Action {idx + 1}/{len(actions)}: {action.get('type', 'unknown')}
"""
            if action.get('selector'):
                action_detail += f"Selector: {action['selector']}\n"
            if action.get('description'):
                action_detail += f"Description: {action['description']}\n"
            if action.get('value'):
                action_detail += f"Value: {action['value']}\n"
            
            documents.append(Document(
                page_content=action_detail,
                metadata={
                    **base_metadata,
                    "chunk_type": "individual_action",
                    "action_index": idx,
                    "action_type": action.get('type', 'unknown')
                }
            ))
        
        # 4. Result/outcome chunk (for learning from failures)
        if result:
            result_content = f"""Goal: {goal}
Outcome: {'Success' if success else 'Failure'}
URL: {target_url}

"""
            if success:
                result_content += f"Successfully completed {len(actions)} actions.\n"
            else:
                error_msg = result.get('error', 'Unknown error')
                result_content += f"Failed with error: {error_msg}\n"
                if result.get('results'):
                    failed_actions = [r for r in result['results'] if not r.get('success')]
                    if failed_actions:
                        result_content += f"\nFailed actions: {', '.join([a.get('action', 'unknown') for a in failed_actions])}\n"
            
            documents.append(Document(
                page_content=result_content,
                metadata={**base_metadata, "chunk_type": "result_outcome"}
            ))
        
        # 5. Domain-specific chunk (for URL pattern matching)
        if target_url:
            domain = self._extract_domain(target_url)
            domain_content = f"""Domain: {domain}
Full URL: {target_url}
Task: {goal}
Actions: {len(actions)} steps
Success: {success}

This shows how to interact with {domain} for similar tasks."""
            
            documents.append(Document(
                page_content=domain_content,
                metadata={
                    **base_metadata,
                    "chunk_type": "domain_pattern",
                    "domain": domain
                }
            ))
        
        return documents
    
    def _extract_domain(self, url: str) -> str:
        """Extract domain from URL"""
        try:
            from urllib.parse import urlparse
            parsed = urlparse(url)
            return parsed.netloc or url
        except:
            return url
    
    def get_relevant_context(
        self, 
        goal: str, 
        target_url: str = "",
        k: int = 5,
        fetch_k: int = 20,
        score_threshold: float = 0.7
    ) -> List[Dict]:
        """
        Retrieve relevant past interactions using advanced similarity search
        
        Args:
            goal: The user's goal/task
            target_url: Target URL (for domain-specific matching)
            k: Number of top results to return
            fetch_k: Number of candidates to fetch before filtering
            score_threshold: Minimum similarity score (0-1, lower is better for distance)
        
        Returns:
            List of relevant context with chunks grouped by interaction
        """
        
        # Create multi-part query for better semantic matching
        query_parts = [f"Task: {goal}"]
        if target_url:
            domain = self._extract_domain(target_url)
            query_parts.append(f"Domain: {domain}")
            query_parts.append(f"URL: {target_url}")
        
        query = "\n".join(query_parts)
        
        # Perform similarity search with more candidates
        results = self.vectorstore.similarity_search_with_score(
            query=query,
            k=fetch_k
        )
        
        # Group chunks by interaction_id for context assembly
        interaction_chunks = defaultdict(list)
        
        for doc, score in results:
            # Filter by score threshold (FAISS uses distance, lower is better)
            if score > score_threshold:
                continue
            
            # Filter for successful interactions when possible
            if doc.metadata.get("success") == "False":
                continue
            
            interaction_id = doc.metadata.get("interaction_id", "unknown")
            interaction_chunks[interaction_id].append({
                "content": doc.page_content,
                "metadata": doc.metadata,
                "similarity_score": float(score),
                "chunk_type": doc.metadata.get("chunk_type", "unknown")
            })
        
        # Rank interactions by best chunk score and completeness
        ranked_interactions = []
        for interaction_id, chunks in interaction_chunks.items():
            # Get best (lowest) score for this interaction
            best_score = min(chunk["similarity_score"] for chunk in chunks)
            
            # Prioritize interactions with multiple chunk types (more complete)
            chunk_types = set(chunk["chunk_type"] for chunk in chunks)
            completeness_bonus = len(chunk_types) * 0.1
            
            # Domain match bonus
            domain_match = any(
                chunk["chunk_type"] == "domain_pattern" and 
                target_url and 
                self._extract_domain(target_url) in chunk["content"]
                for chunk in chunks
            )
            domain_bonus = 0.2 if domain_match else 0.0
            
            # Calculate final score (lower is better)
            final_score = best_score - completeness_bonus - domain_bonus
            
            ranked_interactions.append({
                "interaction_id": interaction_id,
                "chunks": chunks,
                "score": final_score,
                "metadata": chunks[0]["metadata"]  # Use first chunk's metadata
            })
        
        # Sort by score and return top k
        ranked_interactions.sort(key=lambda x: x["score"])
        
        # Format results with assembled context
        relevant_context = []
        for interaction in ranked_interactions[:k]:
            # Assemble chunks in logical order
            assembled_content = self._assemble_chunks(interaction["chunks"])
            
            relevant_context.append({
                "content": assembled_content,
                "metadata": interaction["metadata"],
                "similarity_score": interaction["score"],
                "num_chunks": len(interaction["chunks"]),
                "chunk_types": list(set(c["chunk_type"] for c in interaction["chunks"]))
            })
        
        return relevant_context
    
    def _assemble_chunks(self, chunks: List[Dict]) -> str:
        """Assemble chunks in logical order for coherent context"""
        # Sort chunks by type priority
        type_priority = {
            "goal_summary": 0,
            "action_sequence": 1,
            "individual_action": 2,
            "result_outcome": 3,
            "domain_pattern": 4
        }
        
        sorted_chunks = sorted(
            chunks,
            key=lambda x: (
                type_priority.get(x["chunk_type"], 99),
                x["metadata"].get("chunk_index", 0)
            )
        )
        
        # Remove duplicates while preserving order
        seen_content = set()
        unique_chunks = []
        for chunk in sorted_chunks:
            content = chunk["content"].strip()
            if content not in seen_content:
                seen_content.add(content)
                unique_chunks.append(chunk)
        
        # Assemble with separators
        assembled = []
        current_type = None
        
        for chunk in unique_chunks:
            chunk_type = chunk["chunk_type"]
            
            # Add separator for type changes
            if current_type and current_type != chunk_type:
                assembled.append("---")
            
            assembled.append(chunk["content"])
            current_type = chunk_type
        
        return "\n\n".join(assembled)
    
    def get_session_history(self) -> List[Dict]:
        """Get all interactions from current session"""
        return self.current_session
    
    def format_context_for_prompt(self, relevant_context: List[Dict]) -> str:
        """Format retrieved context for inclusion in LLM prompt with rich metadata"""
        if not relevant_context:
            return ""
        
        formatted = "\n\n" + "="*60 + "\n"
        formatted += "📚 RELEVANT PAST INTERACTIONS (RAG Context)\n"
        formatted += "="*60 + "\n"
        formatted += "Below are similar tasks you've successfully completed before.\n"
        formatted += "Use these as reference for planning your actions.\n\n"
        
        for i, ctx in enumerate(relevant_context, 1):
            metadata = ctx['metadata']
            
            formatted += f"┌─ Example {i} "
            formatted += f"(Relevance: {1 - ctx['similarity_score']:.2%}) ─┐\n"
            formatted += f"│ Goal: {metadata.get('goal', 'N/A')}\n"
            formatted += f"│ URL: {metadata.get('target_url', 'N/A')}\n"
            formatted += f"│ Actions: {metadata.get('num_actions', 'N/A')} steps\n"
            formatted += f"│ Success: {'✓' if metadata.get('success') == 'True' else '✗'}\n"
            
            # Show chunk composition
            if 'chunk_types' in ctx:
                formatted += f"│ Context Types: {', '.join(ctx['chunk_types'])}\n"
            
            formatted += "└" + "─"*58 + "┘\n\n"
            
            # Add the assembled content
            formatted += ctx['content']
            formatted += "\n\n" + "─"*60 + "\n\n"
        
        formatted += "💡 TIP: Adapt these patterns to your current task.\n"
        formatted += "="*60 + "\n\n"
        
        return formatted
    
    def clear_session(self):
        """Clear current session history"""
        self.current_session = []
        self.session_id = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    def clear_all_history(self):
        """Clear all conversation history including vector database"""
        # Clear current session
        self.current_session = []
        self.session_id = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        # Delete and recreate vector store
        if os.path.exists(self.index_path):
            import shutil
            shutil.rmtree(self.index_path)
        
        # Create new empty index with a dummy document
        os.makedirs(self.persist_directory, exist_ok=True)
        dummy_doc = Document(page_content="Initial document", metadata={})
        self.vectorstore = FAISS.from_documents([dummy_doc], self.embeddings)
        self.vectorstore.save_local(self.index_path)
    
    def get_statistics(self) -> Dict:
        """Get statistics about stored interactions with chunk analysis"""
        try:
            # Get all documents from FAISS docstore
            docstore = self.vectorstore.docstore
            
            # Try to access documents safely
            try:
                if hasattr(docstore, '_dict'):
                    all_docs = docstore._dict.values()  # type: ignore
                elif hasattr(docstore, 'search'):
                    # Fallback: try to get all docs
                    all_docs = []
                else:
                    all_docs = []
            except:
                all_docs = []
            
            # Group by interaction_id
            unique_interactions = set()
            chunk_type_counts = defaultdict(int)
            successes = 0
            
            for doc in all_docs:
                if hasattr(doc, 'metadata'):
                    interaction_id = doc.metadata.get('interaction_id')
                    if interaction_id:
                        unique_interactions.add(interaction_id)
                    
                    chunk_type = doc.metadata.get('chunk_type')
                    if chunk_type:
                        chunk_type_counts[chunk_type] += 1
                    
                    if doc.metadata.get('success') == 'True':
                        successes += 1
            
            total_chunks = len(list(all_docs))
            total_interactions = len(unique_interactions)
            
        except Exception as e:
            print(f"Error getting statistics: {e}")
            total_chunks = 0
            total_interactions = 0
            successes = 0
            chunk_type_counts = {}
        
        return {
            "total_interactions": total_interactions,
            "total_chunks": total_chunks,
            "successful_interactions": successes,
            "current_session_length": len(self.current_session),
            "session_id": self.session_id,
            "chunk_types": dict(chunk_type_counts),
            "avg_chunks_per_interaction": round(total_chunks / total_interactions, 1) if total_interactions > 0 else 0
        }

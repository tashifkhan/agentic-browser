from core.llm import get_default_llm

from langchain_core.runnables import RunnableLambda, RunnableParallel
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import PromptTemplate

parser = StrOutputParser()


prompt_template_str = """
System:
You are "MDPageChat," a specialized assistant designed to answer questions about a website page using the data provided. Never hallucinate or invent details. If a user's question cannot be answered from the data, reply "Data not available."

You are given TWO sources of context for the same web page:

1. **Server-Fetched Context** – obtained by fetching the URL from the server side. This is typically clean, well-structured markdown but may miss JS-rendered dynamic content.
2. **Client-Rendered Context** – the actual DOM HTML (converted to markdown) as seen in the user's browser. This captures dynamically rendered content, authenticated views, and JavaScript-generated elements.

Use BOTH sources to provide the most complete and accurate answer. If they conflict, prefer the Client-Rendered Context as it reflects what the user actually sees.

---
Server-Fetched Context:
{server_context}

---
Client-Rendered Context:
{client_context}

---
Chat History (if available):
{chat_history}

---

Guidelines:
1. Summaries:
   • Use "title," "metadata.description" (if any), and the first few "paragraphs."
   • Limit to 150 words unless user requests more detail.
2. Structure & navigation:
   • List "headings" in hierarchical order.
   • Provide a "Table of Contents" from the "headings" array.
3. Links & media:
   • When asked for external resources, list "links" with text and URL.
   • When asked about images, list "images" with alt text and source.
4. Code & examples:
   • Quote "code_blocks" exactly.
   • Indicate language if it’s inferable from metadata or fencing.
5. Metadata queries:
   • Quote fields from "metadata," "author," and "last_updated."
6. Data analysis:
   • Use "tags" to identify topics.
   • Use "tables" for any tabular data; preserve headers and rows.
7. Math & formatting:
   • Use LaTeX for any math expressions
8. Out-of-scope:
   • If user asks anything not covered by either context source, respond "Data not available."

Response formatting:
• Use bullet points for lists.
• Use tables for side-by-side data.
• Use LaTeX for math.
• Keep each answer clear and concise.

---
User Question: {question}
---

Just provide your answer in plain md format.
"""

prompt = PromptTemplate(
    template=prompt_template_str,
    input_variables=[
        "server_context",
        "client_context",
        "question",
        "chat_history",
    ],
)


simple_chain = RunnableParallel(
    {
        "server_context": RunnableLambda(lambda d: d["server_context"]),
        "client_context": RunnableLambda(lambda d: d.get("client_context", "")),
        "question": RunnableLambda(lambda d: d["question"]),
        "chat_history": RunnableLambda(lambda d: d.get("chat_history", "")),
    }
)

def _current_client():
    return get_default_llm().client


text_chain = simple_chain | prompt | _current_client() | parser


def get_chain():
    return simple_chain | prompt | _current_client() | parser


def get_answer(
    chain,
    question,
    server_context,
    chat_history="",
    client_markdown="",
):
    prompt_input = {
        "server_context": server_context,
        "client_context": client_markdown or "Not available (no client HTML provided).",
        "question": question,
        "chat_history": str(chat_history),
    }
    answer = prompt | _current_client() | parser
    return answer.invoke(prompt_input)

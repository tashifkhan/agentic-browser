from core.llm import LargeLanguageModel
from langchain_core.runnables import RunnableLambda, RunnableParallel
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import PromptTemplate


parser = StrOutputParser()


prompt_template_str = """
System:
You are a “GitHub Coding Assistant.” Your purpose is to answer questions about a GitHub repository, explain code, and solve coding problems.
You must base your answers *only* on the provided repository context, which includes file content, structure, and summaries.
Do not invent information or use external knowledge. If the answer is not in the provided context, reply “Data not available.”

---
Repository Summary:
{summary}

---
Repository File Structure (Tree):
{tree}

---
Relevant File Content:
{content}

---
Chat History (if available):
{chat_history}

---

Guidelines:
1.  **Be Concise and Relevant**: Provide direct answers to the user's question using only the information from the context.
2.  **Code Explanations**: When explaining code, be clear and reference the specific file or code block.
3.  **File Navigation**: Use the file structure (`tree`) to answer questions about where files are located or how the project is organized.
4.  **Summaries**: Use the repository summary to provide high-level overviews when asked.
5.  **No External Data**: Do not use any information beyond the provided context. If the context does not contain the answer, state "I cannot answer this question with the provided information."
6.  **Code Generation/Modification**: If asked to write or modify code, base it on the patterns and libraries already present in the repository context.

Response Formatting:
- Use Markdown for all responses.
- Use code blocks with language identifiers for code snippets.
- Use bullet points for lists to improve readability.

---
User Question: {question}
---

Answer:
"""

prompt = PromptTemplate(
    template=prompt_template_str,
    input_variables=[
        "tree",
        "summary",
        "content",
        "question",
        "chat_history",
    ],
)
final_chain = RunnableParallel(
    {
        "content": RunnableLambda(lambda d: d.get("text", "")),
        "question": RunnableLambda(lambda d: d["question"]),
        "chat_history": RunnableLambda(lambda d: d.get("chat_history", "")),
        "tree": RunnableLambda(lambda d: d["tree"]),
        "summary": RunnableLambda(lambda d: d["summary"]),
    }
)


def _build_chain(llm_options: dict | None = None):
    llm_options = llm_options or {}
    llm = LargeLanguageModel(**llm_options)
    return final_chain | prompt | llm.client | parser


def get_chain(llm_options: dict | None = None):
    return _build_chain(llm_options)


def github_processor_optimized(
    question,
    text,
    tree,
    summary,
    chat_history="",
    llm_options: dict | None = None,
):
    try:
        content = text
        chain = _build_chain(llm_options)
        input_data = {
            "question": question,
            "text": content,
            "tree": tree,
            "summary": summary,
            "chat_history": chat_history,
        }

        result = chain.invoke(input_data)
        return result

    except Exception as e:
        print(f"Error in github_processor_optimized: {e}")
        return f"Error processing GitHub content: {str(e)}"

from langchain_core.prompts import ChatPromptTemplate

template = """
You are a helpful assistant that answers questions based on the provided tools. Use the tools to gather information and provide accurate responses. If the information is not available, respond with a message indicating that the data is not available.

TOOLS:
---
You have access to the following tools:

{tools}

To use a tool, please use the following format:

---

here is  the question: {question} 

"""

prompt = ChatPromptTemplate.from_template(template)

from fastapi import APIRouter, HTTPException
from pydantic import HttpUrl
from core import get_logger
from prompts.github import get_chain
from tools.github_crawler import convert_github_repo_to_markdown
from models.requests.github import GitHubRequest
from models.response.gihub import GitHubResponse

router = APIRouter()
logger = get_logger(__name__)


async def generate_github_answer(
    url: HttpUrl,
    question: str,
    chat_history: list[dict] = [],
) -> str:
    """Generate answer using GitHub repository information and prompt"""
    try:

        content_obj = await convert_github_repo_to_markdown(url)

        chain = get_chain()
        response = chain.invoke(
            {
                "summary": content_obj.summary,
                "tree": content_obj.tree,
                "text": content_obj.content,
                "question": question,
                "chat_history": chat_history if chat_history else "",
            }
        )

        if isinstance(response, str):
            return response

        return response.content

    except Exception as e:
        logger.error(f"Error generating answer with LLM: {e}")
        return f"I apologize, but I encountered an error processing your question about the GitHub repository. Please try again."


@router.post("/", response_model=GitHubResponse)
async def github_crawler(request: GitHubRequest):
    try:
        question = request.question
        chat_history = request.chat_history

        if not question:
            raise HTTPException(
                status_code=400,
                detail="question is required",
            )

        url = request.url
        if not url:
            raise HTTPException(
                status_code=400,
                detail="url is required",
            )

        response = await generate_github_answer(
            url=HttpUrl(url),
            question=question,
            chat_history=chat_history,
        )

        return {"content": response}

    except Exception as e:
        logger.error(f"Error in GitHub crawler: {e}")
        raise HTTPException(status_code=500, detail=str(e))

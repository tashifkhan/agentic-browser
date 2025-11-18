from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, Literal

from core.config import get_logger
from core.llm import LargeLanguageModel
from prompts.github import github_processor_optimized
from tools.website_context.request_md import return_markdown as fetch_markdown
from tools.website_context.html_md import return_html_md as html_to_md


logger = get_logger(__name__)


app = FastAPI(title="Agentic Browser API", version="0.1.0")


class ChatRequest(BaseModel):
    prompt: str
    system_message: Optional[str] = None
    provider: Literal[
        "google",
        "openai",
        "anthropic",
        "ollama",
        "deepseek",
        "openrouter",
    ] = "google"
    model: Optional[str] = None
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    temperature: float = 0.4


class ChatResponse(BaseModel):
    content: str


class GithubAnswerRequest(BaseModel):
    question: str
    text: str = Field("", description="Relevant file content or combined context text")
    tree: str = Field("", description="Repository file tree")
    summary: str = Field("", description="Repository summary")
    chat_history: Optional[str] = ""
    # Optional LLM config to override defaults when building the chain
    llm_provider: Optional[str] = None
    llm_model: Optional[str] = None
    llm_api_key: Optional[str] = None
    llm_base_url: Optional[str] = None
    llm_temperature: Optional[float] = None


class GithubAnswerResponse(BaseModel):
    answer: str


class WebsiteMarkdownRequest(BaseModel):
    url: str


class WebsiteMarkdownResponse(BaseModel):
    markdown: str


class HtmlToMdRequest(BaseModel):
    html: str


class HtmlToMdResponse(BaseModel):
    markdown: str


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/v1/chat/generate", response_model=ChatResponse)
def chat_generate(req: ChatRequest):
    try:
        llm = LargeLanguageModel(
            model_name=req.model,
            api_key=req.api_key or "",
            provideer=req.provider,
            base_url=req.base_url,
            temperature=req.temperature,
        )
        content = llm.generate_text(req.prompt, system_message=req.system_message)
        return ChatResponse(content=content)
    except Exception as e:
        logger.exception("/v1/chat/generate failed")
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/v1/github/answer", response_model=GithubAnswerResponse)
def github_answer(req: GithubAnswerRequest):
    try:
        llm_options = {}
        if req.llm_provider:
            llm_options["provider"] = req.llm_provider
        if req.llm_model:
            llm_options["model_name"] = req.llm_model
        if req.llm_api_key:
            llm_options["api_key"] = req.llm_api_key
        if req.llm_base_url:
            llm_options["base_url"] = req.llm_base_url
        if req.llm_temperature is not None:
            llm_options["temperature"] = req.llm_temperature

        answer = github_processor_optimized(
            question=req.question,
            text=req.text,
            tree=req.tree,
            summary=req.summary,
            chat_history=req.chat_history or "",
            llm_options=llm_options or None,
        )
        return GithubAnswerResponse(answer=answer)
    except Exception as e:
        logger.exception("/v1/github/answer failed")
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/v1/website/markdown", response_model=WebsiteMarkdownResponse)
def website_markdown(req: WebsiteMarkdownRequest):
    try:
        md = fetch_markdown(req.url)
        return WebsiteMarkdownResponse(markdown=md)
    except Exception as e:
        logger.exception("/v1/website/markdown failed")
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/v1/website/html-to-md", response_model=HtmlToMdResponse)
def website_html_to_md(req: HtmlToMdRequest):
    try:
        md = html_to_md(req.html)
        return HtmlToMdResponse(markdown=md)
    except Exception as e:
        logger.exception("/v1/website/html-to-md failed")
        raise HTTPException(status_code=400, detail=str(e))


# Optional root
@app.get("/")
def root():
    return {"name": app.title, "version": app.version}

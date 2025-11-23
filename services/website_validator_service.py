from langchain.prompts import PromptTemplate
from pydantic import BaseModel, Field

from core.llm import llm
from prompts.prompt_injection_validator import prompt_template
from tools.website_context.html_md import return_html_md


class WebsiteValidatorRequest(BaseModel):
    html: str


class WebsiteValidatorResponse(BaseModel):
    is_safe: bool = Field(default=False)


def validate_website(request: WebsiteValidatorRequest) -> WebsiteValidatorResponse:
    # 1. Parse HTML to Markdown
    markdown = return_html_md(request.html)

    # 2. Check for prompt injection
    prompt = PromptTemplate(
        template=prompt_template,
        input_variables=[
            "markdown_text",
        ],
    )
    chain = prompt | llm

    result = chain.invoke(
        {"markdown_text": markdown},
    )

    # 3. Process result
    is_safe = str(result.content).strip("```").strip().lower() == "true"

    return WebsiteValidatorResponse(is_safe=is_safe)

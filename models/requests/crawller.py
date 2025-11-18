from typing import Any, Dict, Optional

from pydantic import AliasChoices, BaseModel, Field


class CrawlerRequest(BaseModel):
    question: str
    chat_history: Optional[list[dict[str, Any]]] = Field(
        default_factory=list, description="Optional chat transcript for context."
    )
    google_access_token: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("google_access_token", "google_acces_token"),
        serialization_alias="google_access_token",
        description="OAuth access token with Gmail/Calendar scope.",
    )
    pyjiit_login_response: Optional[Dict[str, Any]] = Field(
        default=None,
        validation_alias=AliasChoices("pyjiit_login_response", "pyjiit_login_responce"),
        serialization_alias="pyjiit_login_response",
        description="Persisted PyJIIT login payload for authenticated requests.",
    )

    model_config = {"populate_by_name": True}

import os
from typing import Any, Literal

from .config import get_settings

try:
    from langchain_core.language_models.chat_models import BaseChatModel
    from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage

    from langchain_google_genai import ChatGoogleGenerativeAI
    from langchain_openai import ChatOpenAI
    from langchain_anthropic import ChatAnthropic
    from langchain_ollama import ChatOllama
except ModuleNotFoundError as e:
    raise ModuleNotFoundError(
        "Missing required language-model packages. Install project dependencies:\n\n"
        "    python -m pip install -e .\n\n"
        "or install the packages listed in `pyproject.toml`."
    ) from e


PROVIDER_CONFIGS = {
    "google": {
        "class": ChatGoogleGenerativeAI,
        "api_key_env": "GOOGLE_API_KEY",
        "default_model": "gemini-2.5-flash",
        "param_map": {"api_key": "google_api_key"},
    },
    "openai": {
        "class": ChatOpenAI,
        "api_key_env": "OPENAI_API_KEY",
        "default_model": "gpt-5-mini",
        "param_map": {
            "api_key": "openai_api_key",
            "base_url": "base_url",
        },
    },
    "anthropic": {
        "class": ChatAnthropic,
        "api_key_env": "ANTHROPIC_API_KEY",
        "default_model": "claude-4-sonnet",
        "param_map": {
            "api_key": "anthropic_api_key",
            "base_url": "base_url",
        },
    },
    "ollama": {
        "class": ChatOllama,
        "api_key_env": None,
        "base_url_env": "OLLAMA_BASE_URL",
        "default_model": "llama3",
        "param_map": {
            "base_url": "base_url",
        },
    },
    "deepseek": {
        "class": ChatOpenAI,
        "api_key_env": "DEEPSEEK_API_KEY",
        "base_url_override": "https://api.deepseek.com/v1",
        "default_model": "deepseek-chat",
        "param_map": {
            "api_key": "openai_api_key",
            "base_url": "base_url",
        },
    },
    "openrouter": {
        "class": ChatOpenAI,
        "api_key_env": "OPENROUTER_API_KEY",
        "base_url_override": "https://openrouter.ai/api/v1",
        "default_model": "mistralai/mistral-7b-instruct",
        "param_map": {
            "api_key": "openai_api_key",
            "base_url": "base_url",
        },
    },
}


class LargeLanguageModel:
    def __init__(
        self,
        model_name: str | None = "gemini-2.5-flash",
        api_key: str = get_settings().google_api_key,
        provider: Literal[
            "google",
            "openai",
            "anthropic",
            "ollama",
            "deepseek",
            "openrouter",
        ] = "google",
        base_url: str | None = None,
        temperature: float = 0.4,
        **kwargs: Any,
    ):
        self.provider = provider.lower()
        config = PROVIDER_CONFIGS.get(self.provider)

        if not config:
            raise ValueError(
                f"Unsupported LLM provider: '{self.provider}'. "
                f"Please choose from {', '.join(PROVIDER_CONFIGS.keys())}"
            )

        llm_class = config["class"]
        self.model_name = model_name if model_name else config.get("default_model")

        if not self.model_name:
            raise ValueError(
                f"No model_name provided and no default_model set for '{self.provider}'."
            )

        params: dict[str, Any] = {"temperature": temperature, "model": self.model_name}

        if config["api_key_env"]:
            final_api_key = api_key if api_key else os.getenv(config["api_key_env"])
            if not final_api_key:
                raise ValueError(
                    f"API key for '{self.provider}' not found. "
                    f"Please provide it directly or set the '{config['api_key_env']}' environment variable."
                )
            key_param_name = config["param_map"].get("api_key", "api_key")
            params[key_param_name] = final_api_key

        elif api_key:
            print(f"Warning: API key provided for '{self.provider}' but it's not typically required.")

        final_base_url: str | None = None
        if base_url:
            final_base_url = base_url
        elif "base_url_override" in config:
            final_base_url = config["base_url_override"]
        elif config.get("base_url_env"):
            final_base_url = os.getenv(config["base_url_env"])

        if final_base_url:
            base_url_param_name = config["param_map"].get("base_url", "base_url")
            params[base_url_param_name] = final_base_url
        elif config.get("base_url_env") and not final_base_url:
            raise ValueError(
                f"Base URL for '{self.provider}' not found. "
                f"Please provide it directly or set the '{config['base_url_env']}' environment variable."
            )

        params.update(kwargs)

        try:
            self.client = llm_class(**params)
            print(f"Successfully initialized {self.provider} LLM with model: {self.model_name}")
        except Exception as e:
            raise RuntimeError(
                f"Failed to initialize LLM for '{self.provider}' with model '{self.model_name}'. "
                f"Details: {e}. Check your API keys, base URLs, and model names."
            )

    def generate_text(self, prompt: str, system_message: str | None = None) -> str:
        messages: list[BaseMessage] = []
        if system_message:
            messages.append(SystemMessage(content=system_message))
        messages.append(HumanMessage(content=prompt))
        try:
            response = self.client.invoke(messages)
            content = response.content
            if isinstance(content, list):
                final_text = ""
                for part in content:
                    if isinstance(part, str):
                        final_text += part
                    elif isinstance(part, dict) and part.get("type") == "text":
                        final_text += part.get("text", "")
                return final_text
            return str(content)
        except Exception as e:
            raise RuntimeError(
                f"Error generating text with {self.provider} ({self.model_name}): {e}"
            )

    def summarize_text(self, text: str) -> str:
        return f"Summary of the text: {text[:50]}..."


# ── Default-LLM holder + lazy module attributes ────────────────────────────────
#
# Two module attributes are exposed to legacy callers:
#   - `_model` : the LargeLanguageModel wrapper instance
#   - `llm`    : the underlying langchain client (i.e. `_model.client`)
#
# Both are resolved through __getattr__ so that `reload_default_llm()` (called
# at startup and after the user updates the override via /api/integrations/llm/model)
# rebinds the active default for all subsequent reads.
#
# IMPORTANT: callers that do `from core.llm import llm` still capture a snapshot
# at import time. To always see the latest default, prefer `from core import llm`
# and reference `llm.llm`, or call `get_default_llm()` directly.

_default: LargeLanguageModel | None = None


_PROVIDER_TO_SECRET = {
    "google": "google_api_key",
    "openai": "openai_api_key",
    "anthropic": "anthropic_api_key",
    "deepseek": "deepseek_api_key",
    "openrouter": "openrouter_api_key",
}


def _build_default(
    provider: str | None = None,
    model: str | None = None,
    temperature: float | None = None,
    api_key: str | None = None,
) -> LargeLanguageModel:
    p = (provider or "google").lower()
    cfg = PROVIDER_CONFIGS.get(p, PROVIDER_CONFIGS["google"])
    if api_key is None:
        # Sync path: env/settings only. The async reload_default_llm()
        # rebinds with DB-resolved values at startup and on settings changes.
        secret_name = _PROVIDER_TO_SECRET.get(p)
        try:
            from services.secrets_service import get_secrets_service
            api_key = get_secrets_service().resolve_sync(secret_name) if secret_name else ""
        except Exception:
            api_key = getattr(get_settings(), secret_name, "") if secret_name else ""
    return LargeLanguageModel(
        model_name=model or cfg.get("default_model"),
        api_key=api_key or "",
        provider=p,  # type: ignore[arg-type]
        temperature=temperature if temperature is not None else 0.4,
    )


def get_default_llm() -> LargeLanguageModel:
    global _default
    if _default is None:
        _default = _build_default()
    return _default


async def reload_default_llm() -> LargeLanguageModel:
    """Re-read AppSetting llm.default and rebind the global default."""
    global _default
    try:
        from services.app_state import AppStateService

        override = await AppStateService().get_setting("llm.default")
    except Exception:
        override = None
    provider = (override or {}).get("provider")
    api_key: str | None = None
    secret_name = _PROVIDER_TO_SECRET.get((provider or "google").lower())
    if secret_name:
        try:
            from services.secrets_service import get_secrets_service
            api_key = await get_secrets_service().resolve(secret_name)
        except Exception:
            api_key = None
    if override:
        try:
            _default = _build_default(
                provider=provider,
                model=override.get("model"),
                temperature=override.get("temperature"),
                api_key=api_key,
            )
        except Exception as exc:
            print(f"Failed to apply LLM override {override!r}, falling back to env defaults: {exc}")
            _default = _build_default(api_key=api_key)
    else:
        _default = _build_default(api_key=api_key)
    return _default


class _DefaultLLMProxy:
    """Forwards every attribute access / call to the live default LLM client.
    Lets `from core.llm import llm` keep working while honouring runtime overrides."""

    __slots__ = ()

    def _target(self):
        return get_default_llm().client

    def __getattr__(self, item):
        return getattr(self._target(), item)

    def __call__(self, *args, **kwargs):
        return self._target()(*args, **kwargs)

    def __repr__(self):
        try:
            return f"<DefaultLLMProxy -> {self._target()!r}>"
        except Exception as exc:
            return f"<DefaultLLMProxy unbound: {exc}>"


class _DefaultModelProxy:
    """Same idea for the LargeLanguageModel wrapper instance."""

    __slots__ = ()

    def _target(self) -> LargeLanguageModel:
        return get_default_llm()

    def __getattr__(self, item):
        return getattr(self._target(), item)

    def __repr__(self):
        try:
            return f"<DefaultModelProxy -> {self._target()!r}>"
        except Exception as exc:
            return f"<DefaultModelProxy unbound: {exc}>"


def __getattr__(name: str):
    if name == "_model":
        return _DefaultModelProxy()
    if name == "llm":
        return _DefaultLLMProxy()
    raise AttributeError(f"module 'core.llm' has no attribute {name!r}")


if __name__ == "__main__":
    m = LargeLanguageModel(model_name="gemini-2.5-flash", provider="google", temperature=0.3)
    print(m.generate_text("Hello, how are you?"))

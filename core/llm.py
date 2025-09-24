import os
from config import google_api_key
from typing import Literal, Any

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_openai import ChatOpenAI
from langchain_anthropic import ChatAnthropic
from langchain_ollama import ChatOllama


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
        api_key: str = google_api_key,
        provideer: Literal[
            "google", "openai", "claude", "ollama", "deepseek"
        ] = "google",
        base_url: str | None = None,
        temperature: float = 0.4,
        **kwargs: Any,
    ):
        if not api_key:
            raise ValueError("API key must be provided for the LLM.")

        self.provider = provideer.lower()
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

        params: dict[str, Any] = {
            "temperature": temperature,
        }

        params["model"] = self.model_name

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
            print(
                f"Warning: API key provided for '{self.provider}' but it's not typically required."
            )

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
            self.client: BaseChatModel = llm_class(**params)
            print(
                f"Successfully initialized {self.provider} LLM with model: {self.model_name}"
            )

        except Exception as e:
            raise RuntimeError(
                f"Failed to initialize LLM for '{self.provider}' with model '{self.model_name}'. "
                f"Details: {e}. Check your API keys, base URLs, and model names."
            )

    def generate_text(
        self,
        prompt: str,
        system_message: str | None = None,
    ) -> str:

        messages: list[BaseMessage] = []
        if system_message:
            messages.append(SystemMessage(content=system_message))

        messages.append(HumanMessage(content=prompt))

        try:
            response = self.client.invoke(messages)
            return str(response.content)

        except Exception as e:
            raise RuntimeError(
                f"Error generating text with {self.provider} ({self.model_name}): {e}"
            )

    def summarize_text(self, text: str) -> str:
        return f"Summary of the text: {text[:50]}..."


if __name__ == "__main__":
    llm = LargeLanguageModel(
        model_name="gemini-2.5-flash",
        provideer="google",
        temperature=0.3,
    )
    response = llm.generate_text("Hello, how are you?")
    print(response)

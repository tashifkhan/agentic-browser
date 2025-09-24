import os
from .config import google_api_key


class LargeLanguageModel:
    def __init__(
        self,
        model_name: str = "gemini-2.5-flash",
        api_key: str = google_api_key,
        provideer: str = "google",
        temperature: float = 0.4,
    ):
        if not api_key:
            raise ValueError("API key must be provided for the LLM.")

        if provideer == "google":
            from langchain_google_genai import ChatGoogleGenerativeAI

            self.client = ChatGoogleGenerativeAI(
                model=model_name,
                api_key=api_key,
                temperature=temperature,
            )

        # else:
        # raise ValueError(
        #     f"Unsupported provider: {provideer}, only 'google' is supported. rn"
        # )
        elif provideer == "openai":
            from langchain_openai import ChatOpenAI

            self.client = ChatOpenAI(
                model=model_name,
                openai_api_key=api_key,  # type: ignore
            )

        elif provideer == "claude":
            from langchain_anthropic import Anthropic

            self.client = Anthropic(
                model=model_name,
                anthropic_api_key=api_key,
            )

        elif provideer == "ollama":
            from langchain_ollama import Ollama

            self.client = Ollama(
                model=model_name,
                ollama_api_key=api_key,
            )

        elif provideer == "deepseek":
            from langchain_deepseek import DeepSeek

            self.client = DeepSeek(
                model=model_name,
                deepseek_api_key=api_key,
            )

        else:
            raise ValueError(f"Unsupported provider: {provideer}")

        self.model_name = model_name

    def generate_text(self, prompt: str) -> str:
        return f"Generated text from {self.model_name} for prompt: {prompt}"

    def summarize_text(self, text: str) -> str:
        return f"Summary of the text: {text[:50]}..."

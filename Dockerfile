# syntax=docker/dockerfile:1.7

FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

WORKDIR /app

# Runtime deps:
# - ffmpeg is required by faster-whisper for voice transcription routes
# - git is used by repo-related tooling
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    git \
    ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Install uv binary for reproducible lockfile-based installs.
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Install Python dependencies first for better layer caching.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# Copy application code.
COPY . .

EXPOSE 5454

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:5454/api/genai/health/', timeout=3)" || exit 1

CMD ["uv", "run", "uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "5454"]

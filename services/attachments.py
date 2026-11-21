"""Turn an uploaded file into content the chat model can read.

Images become image blocks (a base64 data URL in the `image_url` shape, which
the OpenAI, Anthropic, Google and Ollama LangChain clients all accept), so they
reach whichever model is picked and go through the normal agent with its tools
and memory. Text, code and PDFs become text.

Only files under uploads/ are read. The path comes from the client, so
anything else is refused.
"""
from __future__ import annotations

import base64
import io
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from core import get_logger

logger = get_logger(__name__)

# Same folder routers/file_upload.py saves into (not imported, to keep
# services free of router imports).
UPLOAD_DIR = Path(__file__).resolve().parent.parent / "uploads"

IMAGE_TYPES = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp"}
# Anthropic takes up to 5 MB and 8000 px per image; larger photos also cost
# more tokens than they're worth. Shrink anything over these.
MAX_IMAGE_BYTES = 3_500_000
MAX_IMAGE_SIDE = 2048
MAX_TEXT_CHARS = 60_000


class AttachmentError(ValueError):
    pass


@dataclass
class Attachment:
    name: str
    kind: str  # "image" or "text"
    block: dict[str, Any]

    @property
    def is_image(self) -> bool:
        return self.kind == "image"


def _resolve(path: str) -> Path:
    root = UPLOAD_DIR.resolve()
    candidate = Path(path)
    if not candidate.is_absolute():
        candidate = root / candidate
    resolved = candidate.resolve()
    if root not in resolved.parents:
        raise AttachmentError("Attachments must be uploaded through /api/upload first.")
    if not resolved.is_file():
        raise AttachmentError(f"Attachment {resolved.name} no longer exists. Attach it again.")
    return resolved


def _display_name(path: Path) -> str:
    # Uploads are saved as "<8 hex>_<original name>".
    stem, _, rest = path.name.partition("_")
    return rest if len(stem) == 8 and rest else path.name


def _image_block(path: Path) -> dict[str, Any]:
    data = path.read_bytes()
    mime = IMAGE_TYPES[path.suffix.lower()]
    try:
        from PIL import Image

        with Image.open(io.BytesIO(data)) as img:
            too_big = len(data) > MAX_IMAGE_BYTES or max(img.size) > MAX_IMAGE_SIDE
            animated = getattr(img, "is_animated", False)
            if too_big and not animated:
                img.thumbnail((MAX_IMAGE_SIDE, MAX_IMAGE_SIDE))
                out = io.BytesIO()
                if img.mode in ("RGBA", "LA", "P"):
                    img.save(out, "PNG", optimize=True)
                    mime = "image/png"
                else:
                    img.convert("RGB").save(out, "JPEG", quality=85)
                    mime = "image/jpeg"
                data = out.getvalue()
    except Exception as exc:  # Pillow missing or an odd file: send as is.
        logger.debug("Image not resized (%s): %s", path.name, exc)
    encoded = base64.b64encode(data).decode()
    return {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{encoded}"}}


def _pdf_text(path: Path) -> str:
    from pdfminer.high_level import extract_text

    return extract_text(str(path)) or ""


def load(path: str) -> Attachment:
    file = _resolve(path)
    name = _display_name(file)
    suffix = file.suffix.lower()
    if suffix in IMAGE_TYPES:
        return Attachment(name=name, kind="image", block=_image_block(file))
    if suffix == ".pdf":
        text = _pdf_text(file).strip()
        if not text:
            raise AttachmentError(f"{name} has no text layer (a scanned PDF?). Attach the pages as images instead.")
    else:
        text = file.read_text(errors="replace")
    clipped = text[:MAX_TEXT_CHARS]
    note = f"\n[cut at {MAX_TEXT_CHARS} of {len(text)} characters]" if len(text) > MAX_TEXT_CHARS else ""
    return Attachment(name=name, kind="text", block={"type": "text", "text": f"Attached file {name}:\n```\n{clipped}\n```{note}"})


async def check_model_sees_images() -> str | None:
    """A reason the current model can't read images, or None if it can (or
    models.dev doesn't know the model, e.g. a custom endpoint)."""
    from core.llm import get_default_llm
    from core.model_catalog import model_info

    model = get_default_llm()
    info = await model_info(model.provider, model.model_name)
    if info and info.get("input") and "image" not in info["input"]:
        return (
            f"{model.model_name} can't read images. Pick a model that can, such as a recent "
            "Gemini, GPT or Claude model, from the model menu and send it again."
        )
    return None


def user_content(question: str, attachment: Attachment) -> list[dict[str, Any]]:
    """Content blocks for the user's message: the question, then the file."""
    intro = question.strip() or f"Describe the attached file {attachment.name}."
    if attachment.is_image:
        intro += f"\n\n(Attached image: {attachment.name})"
    return [{"type": "text", "text": intro}, attachment.block]

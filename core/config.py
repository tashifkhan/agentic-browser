import os
import logging
import dotenv

# load .env varibles
dotenv.load_dotenv()

ENV = os.getenv("ENV", "development")
DEBUG = os.getenv("DEBUG", True if ENV == "development" else False)
BACKEND_HOST = os.getenv("BACKEND_HOST", "0.0.0.0")
BACKEND_PORT = int(os.getenv("BACKEND_PORT", 5454))

# Google API key
google_api_key = os.getenv("GOOGLE_API_KEY", "")

# logging setup
logging_level = logging.DEBUG if DEBUG else logging.INFO
logging.basicConfig(level=logging_level)
logger = logging.getLogger(__name__)


def get_logger(name: str) -> logging.Logger:
    l = logging.getLogger(name)
    l.setLevel(logging_level)
    return l

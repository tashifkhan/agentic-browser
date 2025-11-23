from fastapi import APIRouter

from services.website_validator_service import (
    WebsiteValidatorRequest,
    WebsiteValidatorResponse,
    validate_website,
)

router = APIRouter()


@router.post("/validate-website", response_model=WebsiteValidatorResponse)
def validate_website_endpoint(request: WebsiteValidatorRequest):
    return validate_website(request)

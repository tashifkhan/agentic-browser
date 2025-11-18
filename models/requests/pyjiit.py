from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class PyjiitInstituteEntry(BaseModel):
    label: str = Field(..., description="Institute display name.")
    value: str = Field(..., description="Institute identifier value.")


class PyjiitRegData(BaseModel):
    bypass: str = Field(..., description="Indicates whether bypass is enabled.")
    clientid: str = Field(..., description="Client identifier for the session.")
    userDOB: Optional[str] = Field(
        default=None,
        description="User date of birth in YYYY-MM-DD format, if supplied.",
    )
    name: Optional[str] = Field(default=None, description="Full name of the member.")
    lastvisitdate: Optional[str] = Field(
        default=None, description="Timestamp of the previous visit if provided."
    )
    membertype: Optional[str] = Field(
        default=None, description="Member type code (e.g. 'S' for student)."
    )
    enrollmentno: Optional[str] = Field(
        default=None, description="Enrollment number associated with the member."
    )
    userid: Optional[str] = Field(default=None, description="Unique user identifier.")
    expiredpassword: Optional[str] = Field(
        default=None, description="Flag indicating whether the password is expired."
    )
    institutelist: List[PyjiitInstituteEntry] = Field(
        default_factory=list,
        description="List of institutes available to the member.",
    )
    memberid: Optional[str] = Field(
        default=None, description="Member identifier for the session."
    )
    token: Optional[str] = Field(
        default=None, description="JWT token issued by the portal."
    )


class PyjiitRawResponse(BaseModel):
    regdata: PyjiitRegData = Field(..., description="Registration metadata payload.")
    clientidforlink: Optional[str] = Field(
        default=None, description="Client identifier used for deep-linking."
    )


class PyjiitLoginResponse(BaseModel):
    raw_response: PyjiitRawResponse = Field(
        ..., description="Raw response payload returned by the PyJIIT portal."
    )
    regdata: PyjiitRegData = Field(..., description="Top-level registration data copy.")
    institute: Optional[str] = Field(
        default=None, description="Selected institute display name."
    )
    instituteid: Optional[str] = Field(
        default=None, description="Identifier of the selected institute."
    )
    memberid: Optional[str] = Field(
        default=None, description="Member identifier bound to the session."
    )
    userid: Optional[str] = Field(
        default=None, description="User identifier associated with the session."
    )
    token: Optional[str] = Field(
        default=None, description="JWT token issued to the authenticated session."
    )
    expiry: Optional[datetime] = Field(
        default=None,
        description="Token expiry timestamp parsed from the JWT payload.",
    )
    clientid: Optional[str] = Field(
        default=None, description="Client identifier echoed by the portal."
    )
    membertype: Optional[str] = Field(
        default=None, description="Member type echoed by the portal."
    )
    name: Optional[str] = Field(
        default=None, description="Display name associated with the session."
    )

    model_config = {
        "populate_by_name": True,
    }

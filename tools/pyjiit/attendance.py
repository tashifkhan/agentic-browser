from dataclasses import dataclass


@dataclass
class AttendanceHeader:
    """
    Class which contains header info in the Attendance API
    """

    branchdesc: str
    name: str
    programdesc: str
    stynumber: str

    @staticmethod
    def from_json(resp: dict) -> "AttendanceHeader":
        return AttendanceHeader(
            branchdesc=resp["branchdesc"],
            name=resp["name"],
            programdesc=resp["programdesc"],
            stynumber=resp["stynumber"],
        )


@dataclass
class Semester:
    """
    Class which contains Semester info
    """

    registration_code: str
    registration_id: str

    @staticmethod
    def from_json(resp: dict) -> "Semester":
        return Semester(
            registration_id=resp["registrationid"],
            registration_code=resp["registrationcode"],
        )


class AttendanceMeta:
    def __init__(self, resp) -> None:
        self.raw_response = resp
        self.headers = [AttendanceHeader.from_json(i) for i in resp["headerlist"]]
        self.semesters = [Semester.from_json(i) for i in resp["semlist"]]

    def latest_header(self):
        return self.headers[0]

    def latest_semester(self):
        return self.semesters[0]

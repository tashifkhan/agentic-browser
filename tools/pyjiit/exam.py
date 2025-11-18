from dataclasses import dataclass

@dataclass
class ExamEvent:
    """Class containing exam event info"""
    exam_event_code: str
    event_from: int
    exam_event_desc: str
    registration_id: str
    exam_event_id: str

    @staticmethod
    def from_json(resp: dict):
        return ExamEvent(
            resp["exameventcode"],
            resp["eventfrom"],
            resp["exameventdesc"],
            resp["registrationid"],
            resp["exameventid"]
        )




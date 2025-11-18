from dataclasses import dataclass

@dataclass
class RegisteredSubject:
    """Class containing registered subject info like Lecturer name, credits, etc"""
    employee_name: str
    employee_code: str
    minor_subject: str
    remarks: str
    stytype: str
    credits: int
    subject_code: str
    subject_component_code: str
    subject_desc: str
    subject_id: str
    audtsubject: str

    @staticmethod
    def from_json(resp: dict):
        return RegisteredSubject(
            resp["employeename"],
            resp["employeecode"],
            resp["minorsubject"],
            resp["remarks"],
            resp["stytype"],
            resp["credits"],
            resp["subjectcode"],
            resp["subjectcomponentcode"],
            resp["subjectdesc"],
            resp["subjectid"],
            resp["audtsubject"]
        )



class Registrations:
    """Class containing all registered subjects and total course credits for the semester"""
    def __init__(self, resp: dict) -> None:
        self.raw_response = resp
        self.total_credits = resp["totalcreditpoints"]
        self.subjects = [RegisteredSubject.from_json(i) for i in resp["registrations"]]



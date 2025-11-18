from datetime import datetime
from pprint import pformat
from pyjiit.encryption import serialize_payload, generate_local_name
from pyjiit.exam import ExamEvent
from pyjiit.registration import Registrations
from pyjiit.tokens import Captcha
from pyjiit.default import CAPTCHA
from pyjiit.exceptions import APIError, LoginError, NotLoggedIn, SessionExpired, AccountAPIError
from pyjiit.attendance import AttendanceMeta, AttendanceHeader, Semester

from functools import wraps
import requests
import json
import base64


API = "https://webportal.jiit.ac.in:6011/StudentPortalAPI"

def authenticated(method):
    """
    :param method: A method of Webportal class
    :returns: A wrapper to method with checks for session invalidation
    """
    @wraps(method)
    def wrapper(self, *args, **kwargs):
        if self.session is None:
            raise NotLoggedIn

        # Commenting this because rn the webportal api is bugged,
        # and returns wrong expiry time for prefectly valid cookies
        # if self.session.expiry < datetime.now():
        #     raise SessionExpired

        return method(self, *args, **kwargs)
    wrapper.__doc__ = method.__doc__
    return wrapper

class WebportalSession:
    """
    Class which contains session cookies for JIIT Webportal
    """
    def __init__(self, resp: dict) -> None:
        self.raw_response = resp
        self.regdata: dict = resp['regdata']

        institute = self.regdata['institutelist'][0]
        self.institute: str = institute['label']
        self.instituteid: str = institute['value']
        self.memberid: str = self.regdata['memberid']

        self.userid: str = self.regdata['userid']

        self.token: str = self.regdata['token']
        expiry_timestamp = json.loads(base64.b64decode(self.token.split(".")[1]))['exp']
        self.expiry = datetime.fromtimestamp(expiry_timestamp)

        self.clientid = self.regdata["clientid"]
        self.membertype = self.regdata["membertype"]
        self.name = self.regdata["name"]

    def get_headers(self):
        """
        :returns: A dictionary with Authorization HTTP headers
        """
        return {
            "Authorization": f"Bearer {self.token}",
            "LocalName": generate_local_name()
        }

class Webportal:
    """
    Class which implements the functionality for
    JIIT Webportal
    """

    def __init__(self) -> None:
        self.session = None

    def __str__(self) -> str:
        return "Driver Class for JIIT Webportal"

    def __hit(self, *args, **kwargs):
        exception = APIError

        if kwargs.get("exception"):
            exception = kwargs["exception"]
            kwargs.pop("exception")

        if kwargs.get("authenticated"):
            header = self.session.get_headers() # Assumes calling method is authenticated
            kwargs.pop("authenticated")
        else:
            header = {"LocalName": generate_local_name()}

        if kwargs.get("headers"):
            kwargs["headers"].update(header)
        else:
            kwargs["headers"] = header


        resp = requests.request(*args, **kwargs).json()
        if type(resp["status"]) is int and resp["status"] == 401:
            raise SessionExpired(resp["error"])

        if resp["status"]["responseStatus"] != "Success":
            raise exception("status:\n"+pformat(resp["status"]))

        return resp


    def student_login(self, username: str, password: str, captcha: Captcha) -> WebportalSession:
        """
        :param username: A username
        :param password: A password
        :param captcha: Captcha object
        :returns: WebportalSession object (Also sets the internal session variable to this)
        :raises LoginError: Raised for any error in the remote API while Logging in
        """
        pretoken_endpoint = "/token/pretoken-check"
        token_endpoint = "/token/generate-token1"


        payload = {
            "username": username,
            "usertype": "S",
            "captcha": captcha.payload()
        }
        payload = serialize_payload(payload)

        resp = self.__hit("POST", API+pretoken_endpoint, data=payload, exception=LoginError)

        payload = resp["response"]
        payload.pop("rejectedData")

        payload['Modulename'] = 'STUDENTMODULE'
        payload['passwordotpvalue'] = password
        payload = serialize_payload(payload)

        resp = self.__hit("POST", API+token_endpoint, data=payload, exception=LoginError)

        self.session = WebportalSession(resp['response'])

        return self.session

    def get_captcha(self) -> Captcha:
        """
        :returns: Captcha object with empty answer field
        :raises APIError: Raised for generic API error
        """
        ENDPOINT = "/token/getcaptcha"

        resp = self.__hit("GET", API+ENDPOINT)

        return Captcha.from_json(resp["response"])

    @authenticated
    def get_student_bank_info(self):
        """
        :returns: A dictionary with student bank info
        :raises APIError: Raised for generic API error
        """
        ENDPOINT = "/studentbankdetails/getstudentbankinfo"

        payload = {
                "instituteid": self.session.instituteid,
                "studentid": self.session.memberid
        }
        resp = self.__hit("POST", API+ENDPOINT, json=payload, authenticated=True)

        return resp["response"]

    @authenticated
    def get_attendance_meta(self):
        """
        :returns: AttendanceMeta object
        :raises APIError: Raised for generic API error
        """
        ENDPOINT = "/StudentClassAttendance/getstudentInforegistrationforattendence"

        payload = {
            "clientid": self.session.clientid,
            "instituteid": self.session.instituteid,
            "membertype": self.session.membertype
        }

        resp = self.__hit("POST", API+ENDPOINT, json=payload, authenticated=True)

        return AttendanceMeta(resp["response"])

    @authenticated
    def get_attendance(self, header: AttendanceHeader, semester: Semester):
        """
        :param header: An AttendanceHeader object
        :param semester: A Semester object
        :returns: A dictionary with attendance data
        :raises APIError: Raised for generic API error
        """
        ENDPOINT = "/StudentClassAttendance/getstudentattendancedetail"

        payload = {
            "clientid": self.session.clientid,
            "instituteid": self.session.instituteid,
            "registrationcode": semester.registration_code,
            "registrationid": semester.registration_id,
            "stynumber": header.stynumber
        }
        payload = serialize_payload(payload)

        resp = self.__hit("POST", API+ENDPOINT, json=payload, authenticated=True)

        return resp["response"]

    @authenticated
    def set_password(self, old_pswd: str, new_pswd: str):
        """
        :param old_pswd: Old password string
        :param new_pswd: New password string
        :raises APIError: Raised for generic API error
        """
        ENDPOINT = "/clxuser/changepassword"

        payload = {
            "membertype": self.session.membertype,
            "oldpassword": old_pswd,
            "newpassword": new_pswd,
            "confirmpassword": new_pswd
        }

        resp = self.__hit("POST", API+ENDPOINT, json=payload, authenticated=True, exception=AccountAPIError)


    @authenticated
    def get_registered_semesters(self):
        """
        :returns: A list of Semester objects
        :raises APIError: Raised for generic API error
        """
        ENDPOINT = "/reqsubfaculty/getregistrationList"

        payload = {
            "instituteid": self.session.instituteid,
            "studentid": self.session.memberid
        }
        payload = serialize_payload(payload)
        #meow

        resp = self.__hit("POST", API+ENDPOINT, json=payload, authenticated=True)

        return [Semester.from_json(i) for i in resp["response"]["registrations"]]

    @authenticated
    def get_registered_subjects_and_faculties(self, semester: Semester):
        """
        :param semester: A Semester object
        :returns: A Registrations object
        :raises APIError: Raised for generic API error
        """
        ENDPOINT = "/reqsubfaculty/getfaculties"

        payload = {
            "instituteid": self.session.instituteid,
            "studentid": self.session.memberid,
            "registrationid": semester.registration_id
        }
        payload = serialize_payload(payload)

        resp = self.__hit("POST", API+ENDPOINT, json=payload, authenticated=True)

        return Registrations(resp["response"])


    @authenticated
    def get_semesters_for_exam_events(self):
        """
        :returns: A list of Semester objects
        :raises APIError: Raised for generic API error
        """
        ENDPOINT = "/studentcommonsontroller/getsemestercode-withstudentexamevents"

        payload = {
            "clientid": self.session.clientid,
            "instituteid": self.session.instituteid,
            "memberid": self.session.memberid
        }
        payload = serialize_payload(payload)

        resp = self.__hit("POST", API+ENDPOINT, json=payload, authenticated=True)

        return [Semester.from_json(i) for i in resp["response"]["semesterCodeinfo"]["semestercode"]]

    @authenticated
    def get_exam_events(self, semester: Semester):
        """
        :param semester: A Semester object
        :returns: A list of ExamEvent objects
        :raises APIError: Raised for generic API error
        """
        ENDPOINT = "/studentcommonsontroller/getstudentexamevents"

        payload = {
            "instituteid": self.session.instituteid,
            "registationid": semester.registration_id # not a typo
        }
        payload = serialize_payload(payload)

        resp = self.__hit("POST", API+ENDPOINT, json=payload, authenticated=True)

        return [ExamEvent.from_json(i) for i in resp["response"]["eventcode"]["examevent"]]

    @authenticated
    def get_exam_schedule(self, exam_event: ExamEvent):
        """
        :param exam_event: An ExamEvent object
        :returns: A dictionary with exam schedule data
        :raises APIError: Raised for generic API error
        """
        ENDPOINT = "/studentsttattview/getstudent-examschedule"

        payload = {
            "instituteid": self.session.instituteid,
            "registrationid": exam_event.registration_id,
            "exameventid": exam_event.exam_event_id
        }
        payload = serialize_payload(payload)

        resp = self.__hit("POST", API+ENDPOINT, json=payload, authenticated=True)

        return resp["response"]

    @authenticated
    def get_semesters_for_marks(self):
        """
        :returns: A list of Semester objects
        :raises APIError: Raised for generic API error
        """
        ENDPOINT = "/studentcommonsontroller/getsemestercode-exammarks"

        payload = {
            "instituteid": self.session.instituteid,
            "memberid": self.session.memberid
        }
        payload = serialize_payload(payload)

        resp = self.__hit("POST", API+ENDPOINT, json=payload, authenticated=True)

        return [Semester.from_json(i) for i in resp["response"]["semestercode"]]
    
    @authenticated
    def download_marks(self, semester: Semester):
        """
        :returns: Raw bytes of the PDF file content
        :raises APIError: Raised for generic API error
        """
        ENDPOINT = (
            f"/studentsexamview/printstudent-exammarks/"
            f"{self.session.instituteid}/"
            f"{semester.registration_id}/"
            f"{semester.registration_code}"
        )
        url = API + ENDPOINT
        headers = self.session.get_headers() 

        response = requests.get(url, headers=headers, stream=True)
        if response.status_code == 200:
            return response.content
        else:
            raise APIError(f"Failed to download marks PDF: {response.status_code} {response.text}")

    @authenticated
    def get_semesters_for_grade_card(self):
        """
        :returns: A list of Semester objects.
        :raises APIError: Raised for generic API error
        """
        ENDPOINT = "/studentgradecard/getregistrationList"
        payload = {
            "instituteid": self.session.instituteid,
                   }
        payload = serialize_payload(payload)
        
        resp = self.__hit("POST", API+ENDPOINT, json=payload, authenticated=True)

        return [Semester.from_json(i) for i in resp["response"]["registrations"]]
    

    @authenticated
    def __get_program_and_branch_id(self):
        """
        :returns: Dictionary containing Branch ID and Program ID for grade card.
        :raises APIError: Raised for generic API error
        """
        ENDPOINT = "/studentgradecard/getstudentinfo"
        payload = {
            "instituteid": self.session.instituteid
        }
        payload = serialize_payload(payload)
        resp = self.__hit("POST", API+ENDPOINT, json=payload, authenticated=True)
        program_id = resp["response"]["studentinfo"]["programid"]
        branch_id = resp["response"]["studentinfo"]["branchid"]        
        return {"programid" : program_id, "branchid": branch_id};

    @authenticated
    def get_grade_card(self, semester: Semester):
        """
        :params semester: A Semester object
        :returns: Student grade card
        :raises APIError: Raised for generic API error 
        """
        program_and_branch_id = self.__get_program_and_branch_id()
        program_id = program_and_branch_id["programid"]
        branch_id = program_and_branch_id["branchid"]
        ENDPOINT = "/studentgradecard/showstudentgradecard"
        payload = {
            "branchid": branch_id,
            "instituteid": self.session.instituteid,
            "programid": program_id,
            "registrationid": semester.registration_id
        }
        payload = serialize_payload(payload)
        resp = self.__hit("POST", API+ENDPOINT, json=payload, authenticated=True)
        return resp["response"]
    
    @authenticated
    def get_sgpa_cgpa(self, stynumber: int = 0):
        """
        :params stynumber: An integer containing the number of the semester
        :returns: Dictionary containing SGPA and CGPA
        :raises APIError: Raised for generic API error
        """
        ENDPOINT = "/studentsgpacgpa/getallsemesterdata"
        payload = {
            "instituteid": self.session.instituteid,
            "studentid": self.session.memberid,
            "stynumber": stynumber
        }
        payload = serialize_payload(payload)
        resp = self.__hit("POST", API+ENDPOINT, json=payload, authenticated=True)
        return resp["response"]
    
    @authenticated
    def get_fines_msc_charges(self):
        """
        fetches any pending miscellaneous charges/fines for the logged-in student.
        :returns: The raw 'response' dict from the API.
                  If there are no pending payments, the API returns
                  status: Failure with error "NO APPROVED REQUEST FOUND".
        :raises APIError: on any non-Success responseStatus.
        """
        ENDPOINT = "/collectionpendingpayments/getpendingpaymentsdata"
        payload_dict = {
            "instituteid": self.session.instituteid,
            "studentid": self.session.memberid,
        }
        enc_payload = serialize_payload(payload_dict)
        resp = self.__hit("POST", API + ENDPOINT, json=enc_payload, authenticated=True)
        return resp["response"]

    @authenticated
    def get_fee_summary(self):
        """
        fetches the fee summary for the logged-in student.
        :returns: The raw 'response' dict from the API.
        :raises APIError: on any non-Success responseStatus.
        """
        ENDPOINT = "/studentfeeledger/loadfeesummary"
        payload_dict = {
            "instituteid": self.session.instituteid,
        }
        resp = self.__hit("POST", API + ENDPOINT, json=payload_dict, authenticated=True)
        return resp["response"]

    @authenticated
    def get_subject_choices(self, semester: Semester):
        """
        :param semester: A Semester object
        :returns: A dictionary with subject choices data
        :raises APIError: Raised for generic API error
        """
        # get the subject choice print - if the subject is allocated then resp["response"]["subjectpreferencegrid"] is an array of dict which would have an attribute subjectrunning == "Y"
        ENDPOINT = "/studentchoiceprint/getsubjectpreference"
        payload_dict = {
            "instituteid": self.session.instituteid,
            "clientid": self.session.clientid,
            "registrationid": semester.registration_id,
        }
        payload = serialize_payload(payload_dict)
        resp = self.__hit("POST", API + ENDPOINT, json=payload, authenticated=True)
        return resp["response"]

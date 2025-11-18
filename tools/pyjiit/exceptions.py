class APIError(Exception): 
    pass

class LoginError(APIError):
    pass

class SessionError(Exception):
    pass

class SessionExpired(SessionError):
    pass

class NotLoggedIn(SessionError):
    pass

class AccountAPIError(Exception):
    pass


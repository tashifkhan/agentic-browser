from dataclasses import dataclass

@dataclass
class Captcha:
    """
    Class which contains captcha answer, captcha id (hidden) and image in base64
    """
    captcha: str
    hidden: str
    image: str

    def payload(self) -> dict:
        """
        :returns: A dictionary with captcha as required for login request
        """
        return {
            "captcha": self.captcha,
            "hidden": self.hidden,
        }

    @staticmethod
    def from_json(resp: dict) -> 'Captcha':
        return Captcha(
            resp["captcha"]["captcha"],
            resp["captcha"]["hidden"],
            resp["captcha"]["image"]
        )


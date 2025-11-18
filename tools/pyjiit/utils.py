import datetime
import random
import string

def generate_date_seq(date=None):
    if date is None:
        date = datetime.date.today()
    i = str(date.day).zfill(2)
    a = str(date.month).zfill(2)
    r = str(date.year)[2:]
    t = str((date.weekday()+1) % 7)
    
    return i[0] + a[0] + r[0] + t + i[1] + a[1] + r[1]


def get_random_char_seq(n: int) -> str:
    charset = string.digits + string.ascii_letters

    return ''.join(random.choices(charset, k=n))

    



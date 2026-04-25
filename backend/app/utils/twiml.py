def build_hangup_twiml() -> str:
    return """<?xml version="1.0" encoding="UTF-8"?>
<Response><Hangup/></Response>"""


def build_say_twiml(message: str) -> str:
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<Response><Say>{message}</Say></Response>"""

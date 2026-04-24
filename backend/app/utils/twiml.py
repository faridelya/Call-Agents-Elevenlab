from app.config import settings


def build_stream_twiml(call_record_id: str) -> str:
    ws_url = f"{settings.ws_bridge_url}/ws/bridge/{call_record_id}"
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="{ws_url}" track="both_tracks">
      <Parameter name="call_record_id" value="{call_record_id}"/>
    </Stream>
  </Connect>
</Response>"""


def build_hangup_twiml() -> str:
    return """<?xml version="1.0" encoding="UTF-8"?>
<Response><Hangup/></Response>"""


def build_say_twiml(message: str) -> str:
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<Response><Say>{message}</Say></Response>"""

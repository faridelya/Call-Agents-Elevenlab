"""CRM provider abstraction — HubSpot and Salesforce (minimal read/write)."""
import structlog
import httpx

log = structlog.get_logger(__name__)


class HubSpotService:
    BASE = "https://api.hubapi.com"

    def __init__(self, access_token: str):
        self.headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }

    async def get_contact(self, phone: str) -> dict | None:
        params = {
            "filterGroups": [{
                "filters": [{"propertyName": "phone", "operator": "EQ", "value": phone}]
            }],
            "properties": ["firstname", "lastname", "email", "phone", "company", "jobtitle", "lifecyclestage"],
        }
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{self.BASE}/crm/v3/objects/contacts/search",
                json=params,
                headers=self.headers,
            )
            if resp.status_code == 200:
                results = resp.json().get("results", [])
                if results:
                    props = results[0].get("properties", {})
                    return {
                        "crm_id": results[0]["id"],
                        "first_name": props.get("firstname", ""),
                        "last_name": props.get("lastname", ""),
                        "email": props.get("email", ""),
                        "phone": props.get("phone", ""),
                        "company": props.get("company", ""),
                        "title": props.get("jobtitle", ""),
                        "lifecycle_stage": props.get("lifecyclestage", ""),
                    }
        return None

    async def update_contact(self, crm_id: str, properties: dict) -> bool:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.patch(
                f"{self.BASE}/crm/v3/objects/contacts/{crm_id}",
                json={"properties": properties},
                headers=self.headers,
            )
            return resp.status_code in (200, 204)

    async def create_note(self, contact_id: str, body: str) -> bool:
        payload = {
            "properties": {
                "hs_note_body": body,
                "hs_timestamp": str(int(__import__("time").time() * 1000)),
            },
            "associations": [{
                "to": {"id": contact_id},
                "types": [{"associationCategory": "HUBSPOT_DEFINED", "associationTypeId": 202}],
            }],
        }
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{self.BASE}/crm/v3/objects/notes",
                json=payload,
                headers=self.headers,
            )
            return resp.status_code == 201


class SalesforceService:
    """Minimal Salesforce REST API wrapper using username/password OAuth flow."""

    def __init__(self, instance_url: str, access_token: str):
        self.instance_url = instance_url.rstrip("/")
        self.headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }

    async def get_contact(self, phone: str) -> dict | None:
        soql = f"SELECT Id,FirstName,LastName,Email,Phone,Account.Name,Title FROM Contact WHERE Phone='{phone}' LIMIT 1"
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{self.instance_url}/services/data/v57.0/query",
                params={"q": soql},
                headers=self.headers,
            )
            if resp.status_code == 200:
                records = resp.json().get("records", [])
                if records:
                    r = records[0]
                    return {
                        "crm_id": r["Id"],
                        "first_name": r.get("FirstName", ""),
                        "last_name": r.get("LastName", ""),
                        "email": r.get("Email", ""),
                        "phone": r.get("Phone", ""),
                        "company": (r.get("Account") or {}).get("Name", ""),
                        "title": r.get("Title", ""),
                    }
        return None

    async def update_contact(self, crm_id: str, properties: dict) -> bool:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.patch(
                f"{self.instance_url}/services/data/v57.0/sobjects/Contact/{crm_id}",
                json=properties,
                headers=self.headers,
            )
            return resp.status_code == 204


def get_crm_service(provider: str, credentials: dict):
    """Factory — returns the right CRM client based on provider string."""
    if provider == "hubspot":
        return HubSpotService(access_token=credentials.get("access_token", ""))
    if provider == "salesforce":
        return SalesforceService(
            instance_url=credentials.get("instance_url", ""),
            access_token=credentials.get("access_token", ""),
        )
    raise ValueError(f"Unknown CRM provider: {provider}")

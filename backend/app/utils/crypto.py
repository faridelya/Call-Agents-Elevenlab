from cryptography.fernet import Fernet
from app.config import settings
import base64


def _get_fernet() -> Fernet:
    key = settings.encryption_key
    if not key:
        # Dev fallback — generate a deterministic key from secret_key
        import hashlib
        raw = hashlib.sha256(settings.secret_key.encode()).digest()
        key = base64.urlsafe_b64encode(raw).decode()
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt(plaintext: str) -> str:
    return _get_fernet().encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str) -> str:
    return _get_fernet().decrypt(ciphertext.encode()).decode()

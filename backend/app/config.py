from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # App
    app_env: str = "development"
    secret_key: str = "change-me"
    base_url: str = "http://localhost:8001"

    # Ngrok — when set, overrides base_url for Twilio webhook callbacks.
    # start.sh auto-detects the running ngrok tunnel and writes this value.
    ngrok_url: str = ""

    # Database
    database_url: str = "postgresql+asyncpg://voxara:voxara_dev@localhost:5432/voxara"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # ElevenLabs
    elevenlabs_api_key: str = ""
    elevenlabs_base_url: str = "https://api.elevenlabs.io/v1"
    # Secret used to verify ElevenLabs post_call_transcription webhooks.
    # Set this in .env after configuring the webhook in the EL console.
    elevenlabs_webhook_secret: str = ""

    # Twilio (platform-level)
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_phone_number: str = ""

    # OpenAI
    openai_api_key: str = ""

    # Encryption
    encryption_key: str = ""

    # Tokens
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 30

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def public_url(self) -> str:
        """URL Twilio uses for callbacks. Prefers ngrok tunnel over base_url."""
        return self.ngrok_url.rstrip("/") if self.ngrok_url else self.base_url.rstrip("/")

    @property
    def ws_bridge_url(self) -> str:
        return self.public_url.replace("https://", "wss://").replace("http://", "ws://")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

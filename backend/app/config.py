from pydantic_settings import BaseSettings
from pydantic import SecretStr


class Settings(BaseSettings):
    database_url: SecretStr
    redis_url: str = "redis://localhost:6379/0"
    anthropic_api_key: SecretStr
    groq_api_key: SecretStr = SecretStr("")
    google_client_id: str
    google_client_secret: SecretStr
    google_redirect_uri: str

    # Separate cryptographic keys — one key, one purpose
    jwt_secret: SecretStr                 # HS256 signing for user session JWTs
    oauth_encryption_key: SecretStr       # Fernet key for OAuth tokens at rest
    token_signing_key: SecretStr          # HMAC key for approval confirmation tokens

    confirmation_token_ttl_minutes: int = 15
    allowed_origins: str = "http://localhost:5173"

    # SMTP configuration fallbacks
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: SecretStr = SecretStr("")
    smtp_use_tls: bool = True

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()

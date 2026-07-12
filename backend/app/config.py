from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str
    redis_url: str = "redis://localhost:6379/0"
    anthropic_api_key: str
    google_client_id: str
    google_client_secret: str
    google_redirect_uri: str
    token_encryption_key: str  # 32-byte key, base64, for Fernet
    confirmation_token_ttl_minutes: int = 15

    # SMTP configuration fallbacks
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_use_tls: bool = True

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()

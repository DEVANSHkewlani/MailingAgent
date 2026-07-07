import asyncio
from google.oauth2.credentials import Credentials
from cryptography.fernet import Fernet
from app.config import settings
from app.providers.gmail import GmailProvider
from app.providers.google_calendar import GoogleCalendarProvider

fernet = Fernet(settings.token_encryption_key.encode())

async def get_mail_provider_async(user_id: str) -> GmailProvider:
    from app.db.session import get_db
    db = get_db()
    row = await db.fetchrow(
        "SELECT access_token_encrypted, refresh_token_encrypted FROM oauth_credentials "
        "WHERE user_id = $1 AND provider = 'google'", user_id
    )
    if not row:
        raise ValueError(f"No OAuth credentials found. Please connect your Google account in Settings > Email Connections.")
    
    try:
        decrypted_token = fernet.decrypt(row["access_token_encrypted"]).decode()
        decrypted_refresh = fernet.decrypt(row["refresh_token_encrypted"]).decode()
    except Exception:
        raise ValueError("Decryption of Google OAuth credentials failed. Please reconnect your Google account in Settings > Email Connections.")

    creds = Credentials(
        token=decrypted_token,
        refresh_token=decrypted_refresh,
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        token_uri="https://oauth2.googleapis.com/token",
    )
    return GmailProvider(creds)


async def get_calendar_provider_async(user_id: str) -> GoogleCalendarProvider:
    from app.db.session import get_db
    db = get_db()
    row = await db.fetchrow(
        "SELECT access_token_encrypted, refresh_token_encrypted FROM oauth_credentials "
        "WHERE user_id = $1 AND provider = 'google'", user_id
    )
    if not row:
        raise ValueError(f"No OAuth credentials found. Please connect your Google account in Settings > Email Connections.")
    
    try:
        decrypted_token = fernet.decrypt(row["access_token_encrypted"]).decode()
        decrypted_refresh = fernet.decrypt(row["refresh_token_encrypted"]).decode()
    except Exception:
        raise ValueError("Decryption of Google OAuth credentials failed. Please reconnect your Google account in Settings > Email Connections.")

    creds = Credentials(
        token=decrypted_token,
        refresh_token=decrypted_refresh,
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        token_uri="https://oauth2.googleapis.com/token",
    )
    return GoogleCalendarProvider(creds)


def get_mail_provider_sync(user_id: str) -> GmailProvider:
    from app.db.session import get_db_sync
    db = get_db_sync()
    row = db.execute(
        "SELECT access_token_encrypted, refresh_token_encrypted FROM oauth_credentials "
        "WHERE user_id = %s AND provider = 'google'", (user_id,)
    ).fetchone()
    if not row:
        raise ValueError(f"No OAuth credentials found. Please connect your Google account in Settings > Email Connections.")
    
    try:
        decrypted_token = fernet.decrypt(row[0]).decode()
        decrypted_refresh = fernet.decrypt(row[1]).decode()
    except Exception:
        raise ValueError("Decryption of Google OAuth credentials failed. Please reconnect your Google account in Settings > Email Connections.")

    creds = Credentials(
        token=decrypted_token,
        refresh_token=decrypted_refresh,
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        token_uri="https://oauth2.googleapis.com/token",
    )
    return GmailProvider(creds)


def get_calendar_provider_sync(user_id: str) -> GoogleCalendarProvider:
    from app.db.session import get_db_sync
    db = get_db_sync()
    row = db.execute(
        "SELECT access_token_encrypted, refresh_token_encrypted FROM oauth_credentials "
        "WHERE user_id = %s AND provider = 'google'", (user_id,)
    ).fetchone()
    if not row:
        raise ValueError(f"No OAuth credentials found. Please connect your Google account in Settings > Email Connections.")
    
    try:
        decrypted_token = fernet.decrypt(row[0]).decode()
        decrypted_refresh = fernet.decrypt(row[1]).decode()
    except Exception:
        raise ValueError("Decryption of Google OAuth credentials failed. Please reconnect your Google account in Settings > Email Connections.")

    creds = Credentials(
        token=decrypted_token,
        refresh_token=decrypted_refresh,
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        token_uri="https://oauth2.googleapis.com/token",
    )
    return GoogleCalendarProvider(creds)


class LazyProviderProxy:
    """
    Lazy Proxy that allows provider loaders to work transparently in both
    asynchronous (awaited) and synchronous (un-awaited) environments.
    """
    def __init__(self, user_id: str, provider_type: str):
        self._user_id = user_id
        self._provider_type = provider_type  # "mail" or "calendar"
        self._resolved = None

    def _resolve(self):
        if self._resolved is None:
            if self._provider_type == "mail":
                self._resolved = get_mail_provider_sync(self._user_id)
            else:
                self._resolved = get_calendar_provider_sync(self._user_id)
        return self._resolved

    def __await__(self):
        async def _async_resolve():
            if self._resolved is None:
                if self._provider_type == "mail":
                    self._resolved = await get_mail_provider_async(self._user_id)
                else:
                    self._resolved = await get_calendar_provider_async(self._user_id)
            return self._resolved
        return _async_resolve().__await__()

    def __getattr__(self, name):
        resolved = self._resolve()
        return getattr(resolved, name)


def get_mail_provider(user_id: str) -> LazyProviderProxy:
    """Resolves to GmailProvider (async or sync)."""
    return LazyProviderProxy(user_id, "mail")


def get_calendar_provider(user_id: str) -> LazyProviderProxy:
    """Resolves to GoogleCalendarProvider (async or sync)."""
    return LazyProviderProxy(user_id, "calendar")

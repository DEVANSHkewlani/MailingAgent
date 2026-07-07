import asyncio
import asyncpg
from app.config import settings

_pool = None
_main_loop = None

async def get_pool():
    global _pool, _main_loop
    if _pool is None:
        # asyncpg does not support postgresql+asyncpg:// prefix in connection string,
        # so we normalize it to postgresql://
        url = settings.database_url
        if url.startswith("postgresql+asyncpg://"):
            url = url.replace("postgresql+asyncpg://", "postgresql://")
        _pool = await asyncpg.create_pool(url)
        try:
            _main_loop = asyncio.get_running_loop()
        except RuntimeError:
            _main_loop = None
    return _pool

def get_db():
    """
    Async database generator. Returns the pool wrapper.
    In FastAPI/LangGraph we can call:
        db = get_db()
        await db.fetch(...)
    """
    class AsyncDbWrapper:
        def __init__(self, pool):
            self.pool = pool

        async def fetch(self, query, *args):
            async with self.pool.acquire() as conn:
                return await conn.fetch(query, *args)

        async def fetchrow(self, query, *args):
            async with self.pool.acquire() as conn:
                return await conn.fetchrow(query, *args)

        async def execute(self, query, *args):
            async with self.pool.acquire() as conn:
                return await conn.execute(query, *args)

    if _pool is None:
        raise RuntimeError("Database pool not initialized. Run init_db first.")
    return AsyncDbWrapper(_pool)


class RowObject:
    def __init__(self, record):
        self._record = record

    def __getattr__(self, name):
        if name in self._record:
            return self._record[name]
        raise AttributeError(f"'RowObject' has no attribute '{name}'")

    def __getitem__(self, key):
        if isinstance(key, int):
            # Support index access like row[0]
            keys = list(self._record.keys())
            if key < len(keys):
                return self._record[keys[key]]
            raise IndexError("Row index out of range")
        return self._record[key]

    def __repr__(self):
        return repr(dict(self._record))


class SyncResult:
    def __init__(self, rows):
        self.rows = rows
        self.index = 0

    def fetchone(self):
        if self.index < len(self.rows):
            row = self.rows[self.index]
            self.index += 1
            return RowObject(row) if row is not None else None
        return None

    def fetchall(self):
        return [RowObject(r) for r in self.rows]


class SyncDatabaseWrapper:
    def __init__(self, pool):
        self.pool = pool
        self._current_user_id = None

    @property
    def current_user_id(self):
        return self._current_user_id

    @current_user_id.setter
    def current_user_id(self, value):
        self._current_user_id = value

    def transaction(self):
        class TransactionContext:
            def __init__(self, wrapper):
                self.wrapper = wrapper

            def __enter__(self):
                self.wrapper.execute("BEGIN")
                return self

            def __exit__(self, exc_type, exc_val, exc_tb):
                if exc_type is not None:
                    self.wrapper.execute("ROLLBACK")
                else:
                    self.wrapper.execute("COMMIT")
                return False
        return TransactionContext(self)

    def execute(self, query, params=None):
        if params is None:
            params = ()
        elif not isinstance(params, (list, tuple)):
            params = (params,)

        # Convert %s placeholders to $1, $2, $3...
        query_pg = query
        count = 1
        while "%s" in query_pg:
            query_pg = query_pg.replace("%s", f"${count}", 1)
            count += 1

        # Run async query in sync context
        async def _run():
            async with self.pool.acquire() as conn:
                if "SELECT" in query_pg.upper() or "RETURNING" in query_pg.upper():
                    rows = await conn.fetch(query_pg, *params)
                    return SyncResult(rows)
                else:
                    await conn.execute(query_pg, *params)
                    return SyncResult([])

        # Helper function to instantiate the coroutine on the target loop
        async def _run_on_loop(func):
            return await func()

        # If we are in a worker thread and _main_loop is available and running,
        # run the coroutine in _main_loop.
        try:
            current_loop = asyncio.get_running_loop()
        except RuntimeError:
            current_loop = None

        if _main_loop is not None and _main_loop.is_running() and current_loop != _main_loop:
            future = asyncio.run_coroutine_threadsafe(_run_on_loop(_run), _main_loop)
            return future.result()

        if current_loop is None:
            # No running loop in this thread, safe to use asyncio.run
            return asyncio.run(_run())
        
        # Fallback: If loop is already running in this thread, run in a separate thread to prevent blocking/nesting issues
        import threading
        from queue import Queue

        q = Queue()

        def worker():
            try:
                res = asyncio.run(_run())
                q.put((True, res))
            except Exception as e:
                q.put((False, e))

        t = threading.Thread(target=worker)
        t.start()
        t.join()
        success, val = q.get()
        if success:
            return val
        raise val


def get_db_sync():
    """
    Sync database provider for tools/Celery.
    """
    if _pool is None:
        raise RuntimeError("Database pool not initialized. Run init_db first.")
    return SyncDatabaseWrapper(_pool)


async def init_pool():
    global _pool
    await get_pool()

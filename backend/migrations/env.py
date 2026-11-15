from alembic import context

from backend.core import database_url, engine, metadata
from backend import main  # Register every application's tables before schema comparison.

if context.is_offline_mode():
    context.configure(url=database_url, target_metadata=metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()
else:
    from contextlib import nullcontext
    supplied_connection = context.config.attributes.get('connection')
    with (nullcontext(supplied_connection) if supplied_connection is not None else engine.connect()) as connection:
        context.configure(connection=connection, target_metadata=metadata)
        with context.begin_transaction():
            context.run_migrations()


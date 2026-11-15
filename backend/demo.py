"""Create fictional demonstration records or erase a dedicated development database."""
import argparse
from contextlib import nullcontext
from datetime import datetime, timedelta, timezone
from getpass import getpass
import os
import re

from sqlalchemy import select

from backend.auth import upload_dir
from backend.core import engine, metadata, uploads, users
from backend.credentials import hash_password
from backend.main import app  # Register the complete application schema before maintenance.
from backend import rentals, services


NAMES = {
    "customer": "Asha Rao",
    "owner": "Rohan Shah",
    "helper": "Mira Joshi",
    "professional": "Dev Mehta",
    "admin": "Anaya Kulkarni",
}


def require_development():
    if os.getenv("APP_ENV") != "development" or engine.url.database != "neighbourlink_dev":
        raise SystemExit("Seed and reset require APP_ENV=development and the dedicated neighbourlink_dev database.")
    if engine.dialect.name != "postgresql":
        raise SystemExit("Use the development PostgreSQL database.")


def seed(password, connection=None):
    if not 10 <= len(password) <= 256:
        raise SystemExit("Choose a demo password of 10 to 256 characters.")
    emails = {role: f"{role}@example.test" for role in NAMES}
    with (nullcontext(connection) if connection is not None else engine.begin()) as conn:
        # Serialize seed and reset, including when two operator terminals race.
        conn.exec_driver_sql("SELECT pg_advisory_xact_lock(67432109)")
        records = set(conn.scalars(select(users.c.email).where(users.c.email.in_(emails.values()))))
        if records == set(emails.values()):
            print("The five demo accounts already exist. No records changed.")
            return
        if records:
            raise SystemExit("Some demo emails are already in use. No records changed.")
        accounts = {}
        for role, name in NAMES.items():
            accounts[role] = dict(conn.execute(users.insert().values(
                name=name, email=emails[role], password_hash=hash_password(password),
                area="Dadar", is_admin=role == "admin"
            ).returning(users.c.id, users.c.state)).mappings().one())
        for title, category, price, condition, accessories in [
            ("Compact projector", "Projectors/party equipment", 50000, "Lens tested and clear", "Remote, HDMI cable and case"),
            ("Two-person tent", "Camping equipment", 30000, "Clean and dry", "Poles, pegs and carry bag"),
        ]:
            rentals.publish(rentals.Listing(title=title, category=category, area="Dadar",
                daily_price=price, condition=condition, accessories=accessories,
                description=f"{title} available for local pickup.",
                pickup_instructions="Message the owner to meet at the demonstration lobby.",
                return_instructions="Return to the same lobby with all accessories."
            ), conn, accounts["owner"])
        for role, categories, description, basis, rate in [
            ("helper", ["Packing", "Organising"], "Help with packing, sorting and organising boxes.", "hourly", 25000),
            ("professional", ["Packing", "Computer setup"], "Desk setup and packing assistance.", "inspection", 35000),
        ]:
            services.save_provider(services.Provider(
                adult_declared=True, bio=description, categories=categories,
                offerings=["everyday" if role == "helper" else "professional"],
                experience="Self-declared experience on neighbourhood projects.",
                area="Dadar", availability="Weekdays by arrangement", basis=basis, rate=rate
            ), conn, accounts[role])
        request = services.post_request(services.Task(
            title="Pack books for a local move", category="Packing",
            description="Pack three shelves of books into labelled boxes.", area="Dadar",
            preferred_schedule="Tomorrow afternoon", materials="Customer supplies boxes and tape.", budget=60000
        ), conn, accounts["customer"])
        start = datetime.now(timezone.utc).replace(microsecond=0) + timedelta(days=1)
        for role, rate in [("helper", 50000), ("professional", 55000)]:
            services.quote(request["id"], services.Offer(
                basis="fixed", rate=rate, max_minutes=60, travel=0, start_at=start,
                end_at=start + timedelta(hours=1), expires_at=start - timedelta(hours=1),
                scope="Pack and label three shelves of books.", exclusions="No transport.",
                materials="Customer provides boxes and tape."
            ), conn, accounts[role])
    print("Created five accounts, two listings, two provider profiles, one task and two offers.")


def reset(confirmation):
    if confirmation != "neighbourlink_dev":
        raise SystemExit("Supply --confirm neighbourlink_dev to erase the entire development dataset.")
    with engine.begin() as conn:
        conn.exec_driver_sql("SELECT pg_advisory_xact_lock(67432109)")
        referenced_files = list(conn.scalars(select(uploads.c.storage_name)))
        quote = conn.dialect.identifier_preparer.quote
        names = ", ".join(quote(table.name) for table in metadata.tables.values())
        conn.exec_driver_sql(f"TRUNCATE TABLE {names} RESTART IDENTITY")
    root = upload_dir()
    for filename in referenced_files:
        if re.fullmatch(r"[0-9a-f]{32}\.jpg", filename):
            (root / filename).unlink(missing_ok=True)
    print("Cleared application records and their upload files. Database migrations remain applied.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    actions = parser.add_subparsers(dest="action", required=True)
    actions.add_parser("seed")
    actions.add_parser("reset").add_argument("--confirm", required=True)
    args = parser.parse_args()
    require_development()
    if args.action == "seed":
        seed(os.getenv("NEIGHBOURLINK_DEMO_PASSWORD") or getpass("Choose the demo password: "))
    else:
        reset(args.confirm)


if __name__ == "__main__":
    main()

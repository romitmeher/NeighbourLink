"""Administrative bootstrap outside the HTTP API."""
import argparse
import getpass
import os

from sqlalchemy import insert, select

from backend.auth import Register
from backend.core import engine, users
from backend.credentials import hash_password

def main():
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest="command", required=True)
    create = commands.add_parser("create-admin")
    create.add_argument("--email", required=True)
    create.add_argument("--name", required=True)
    args = parser.parse_args()
    password = os.getenv("NEIGHBOURLINK_ADMIN_PASSWORD") or getpass.getpass("New administrator password: ")
    data = Register(name=args.name, email=args.email, password=password)
    with engine.begin() as conn:
        if conn.scalar(select(users.c.id).where(users.c.email == data.email)):
            parser.error("This email already exists. Choose a separate administrator email.")
        conn.execute(insert(users).values(name=data.name, email=data.email, is_admin=True,
            password_hash=hash_password(password)))
    print("Administrator created.")

if __name__ == "__main__":
    main()


"""Generate local Compose secrets. An existing .env is never overwritten."""
from pathlib import Path
import secrets


def main():
    root = Path(__file__).resolve().parents[1]
    template = (root / ".env.example").read_text(encoding="utf-8")
    for key in ("POSTGRES_PASSWORD", "SESSION_SECRET"):
        template = template.replace(f"{key}=\n", f"{key}={secrets.token_hex(32)}\n")
    try:
        with (root / ".env").open("x", encoding="utf-8") as target:
            target.write(template)
    except FileExistsError:
        raise SystemExit("An .env already exists. Use it or edit it directly.")
    print("Local .env created. Configure Razorpay test credentials when available.")


if __name__ == "__main__":
    main()

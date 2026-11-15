"""Password verifier with independent per-user salts; never persist raw credentials."""
import base64
import hashlib
import hmac
import secrets

def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=32768, r=8, p=2, maxmem=64 * 1024**2, dklen=32)
    return "scrypt1$" + base64.b64encode(salt).decode() + "$" + base64.b64encode(digest).decode()

def verify_password(password: str, encoded: str) -> bool:
    try:
        version, salt, digest = encoded.split("$")
        if version != "scrypt1":
            return False
        computed = hashlib.scrypt(password.encode(), salt=base64.b64decode(salt, validate=True),
            n=32768, r=8, p=2, maxmem=64 * 1024**2, dklen=32)
        return hmac.compare_digest(computed, base64.b64decode(digest, validate=True))
    except (ValueError, TypeError):
        return False


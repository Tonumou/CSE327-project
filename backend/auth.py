# ------------------------------------------------------------
# auth.py - user accounts: registration, login, logout
#
# * Passwords are never stored as text: PBKDF2-SHA256 with a random
#   salt and 200 000 rounds (Python's built-in hashlib).
# * Login gives a random session token (64 hex characters). The
#   website sends it in the "Authorization: Bearer <token>" header.
# * The FIRST account ever registered becomes the "operator" (admin:
#   may set up slots); everyone after that is a "driver".
# * Feature 5 - federated identity: "Continue with Google". The browser
#   gets a signed ID token from Google; POST /api/auth/google checks it
#   with Google's official google-auth library and logs that Google
#   account in (making the account the first time). Such an account has
#   no password until the user sets one in Settings.
# ------------------------------------------------------------
import datetime
import hashlib
import hmac
import re
import secrets

import pymysql
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

import config
import database

router = APIRouter(prefix="/api/auth", tags=["Auth"])

SESSION_DAYS = 7
HASH_ROUNDS = 200_000
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class RegisterIn(BaseModel):
    full_name: str
    email: str
    password: str


class LoginIn(BaseModel):
    email: str
    password: str


class GoogleIn(BaseModel):
    credential: str  # the ID token (a JWT) Google gave the browser


def ensure_auth_tables():
    """Create the users and sessions tables if they do not exist yet."""
    conn = database.get_connection()
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
              id INT AUTO_INCREMENT PRIMARY KEY,
              full_name VARCHAR(100) NOT NULL,
              email VARCHAR(120) NOT NULL UNIQUE,
              password_hash VARCHAR(200) NULL,
              google_id VARCHAR(64) NULL UNIQUE,
              role ENUM('driver','operator') NOT NULL DEFAULT 'driver',
              created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )""")
        # tables made before Google sign-in: a Google account may have no password
        cur.execute("ALTER TABLE users MODIFY password_hash VARCHAR(200) NULL")
        database.add_column(cur, "users", "google_id", "VARCHAR(64) NULL UNIQUE AFTER password_hash")
        cur.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
              token CHAR(64) PRIMARY KEY,
              user_id INT NOT NULL,
              expires_at DATETIME NOT NULL,
              created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
              CONSTRAINT fk_session_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )""")
    conn.close()


# ---------- password hashing ----------

def hash_password(password):
    """'pbkdf2$<rounds>$<salt>$<hash>' - the salt makes equal passwords look different."""
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), HASH_ROUNDS)
    return f"pbkdf2${HASH_ROUNDS}${salt}${digest.hex()}"


def check_password(password, stored):
    if not stored:  # account made with Google that has no password yet
        return False
    _, rounds, salt, expected = stored.split("$")
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), int(rounds))
    return hmac.compare_digest(digest.hex(), expected)  # constant time: no timing leaks


# ---------- sessions ----------

def public_user(user):
    return {"id": user["id"], "full_name": user["full_name"], "email": user["email"],
            "role": user["role"],
            "has_password": bool(user.get("password_hash")),  # false = Google-only account
            "google": bool(user.get("google_id"))}


def start_session(user_id):
    token = secrets.token_hex(32)
    expires = datetime.datetime.now() + datetime.timedelta(days=SESSION_DAYS)
    conn = database.get_connection()
    with conn.cursor() as cur:
        cur.execute("INSERT INTO sessions (token, user_id, expires_at) VALUES (%s,%s,%s)",
                    (token, user_id, expires))
    conn.close()
    return token


def user_from_header(authorization):
    """The logged-in user for an 'Authorization: Bearer <token>' header, or 401."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Please log in")
    token = authorization.removeprefix("Bearer ").strip()
    conn = database.get_connection()
    with conn.cursor() as cur:
        cur.execute("""
            SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
            WHERE s.token = %s AND s.expires_at > NOW()""", (token,))
        user = cur.fetchone()
    conn.close()
    if not user:
        raise HTTPException(401, "Session expired - please log in again")
    return user


# ---------- endpoints ----------

@router.post("/register")
def register(body: RegisterIn):
    name, email = body.full_name.strip(), body.email.strip().lower()
    if len(name) < 2:
        raise HTTPException(400, "Please enter your full name")
    if not EMAIL_PATTERN.match(email):
        raise HTTPException(400, "Please enter a valid email address")
    if len(body.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")

    conn = database.get_connection()
    password_hash = hash_password(body.password)
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) AS n FROM users")
        role = "operator" if cur.fetchone()["n"] == 0 else "driver"  # first user = admin
        try:
            cur.execute("INSERT INTO users (full_name, email, password_hash, role) VALUES (%s,%s,%s,%s)",
                        (name, email, password_hash, role))
        except pymysql.err.IntegrityError:
            conn.close()
            raise HTTPException(400, "An account with this email already exists")
        user_id = cur.lastrowid
    conn.close()
    user = {"id": user_id, "full_name": name, "email": email, "role": role, "password_hash": password_hash}
    return {"token": start_session(user_id), "user": public_user(user)}


@router.post("/login")
def login(body: LoginIn):
    conn = database.get_connection()
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM users WHERE email = %s", (body.email.strip().lower(),))
        user = cur.fetchone()
    conn.close()
    # same message for "no such email" and "wrong password": doesn't reveal which emails exist
    if not user or not check_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Wrong email or password. If you signed up with Google, use \"Continue with Google\".")
    return {"token": start_session(user["id"]), "user": public_user(user)}


# ---------- Feature 5: Google sign-in (federated identity) ----------

def verify_google_token(credential):
    """Check the ID token with Google's official library: signed by Google, not
    expired, issued by accounts.google.com and made for OUR client id.
    Returns its claims (sub = Google account id, email, email_verified, name)."""
    try:
        from google.auth.transport import requests as google_requests
        from google.oauth2 import id_token
    except ImportError:
        raise HTTPException(503, "Google sign-in needs the google-auth package: run  pip install -r requirements.txt")
    from google.auth import exceptions as google_errors
    try:
        return id_token.verify_oauth2_token(credential, google_requests.Request(), config.GOOGLE_CLIENT_ID)
    except google_errors.TransportError:
        raise HTTPException(503, "Could not reach Google to check the sign-in. Is the internet connected?")
    except (google_errors.GoogleAuthError, ValueError):  # bad signature, expired, wrong audience or issuer
        raise HTTPException(401, "Google sign-in failed: the Google token is not valid")


@router.get("/google/config")
def google_config():
    """The website asks this before drawing the Google button."""
    return {"enabled": bool(config.GOOGLE_CLIENT_ID), "client_id": config.GOOGLE_CLIENT_ID}


@router.post("/google")
def google_login(body: GoogleIn):
    """Log in with a Google account. The first time, the account is made
    (or linked to an existing account with the same, Google-verified email)."""
    if not config.GOOGLE_CLIENT_ID:
        raise HTTPException(503, "Google sign-in is not set up on this server yet (GOOGLE_CLIENT_ID in backend/config.py)")
    info = verify_google_token(body.credential)
    if not info.get("email_verified"):
        raise HTTPException(401, "Your Google email address is not verified")
    google_id = str(info["sub"])
    email = info["email"].strip().lower()
    name = (info.get("name") or email.split("@")[0]).strip()[:100]

    conn = database.get_connection()
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM users WHERE google_id = %s", (google_id,))
        user = cur.fetchone()
        created = False
        if not user:
            cur.execute("SELECT * FROM users WHERE email = %s", (email,))
            user = cur.fetchone()
            if user:  # same email registered with a password before: link Google to it
                cur.execute("UPDATE users SET google_id = %s WHERE id = %s", (google_id, user["id"]))
                user["google_id"] = google_id
            else:
                cur.execute("SELECT COUNT(*) AS n FROM users")
                role = "operator" if cur.fetchone()["n"] == 0 else "driver"  # first user = admin
                cur.execute("INSERT INTO users (full_name, email, password_hash, google_id, role) VALUES (%s,%s,NULL,%s,%s)",
                            (name, email, google_id, role))
                user = {"id": cur.lastrowid, "full_name": name, "email": email, "role": role,
                        "password_hash": None, "google_id": google_id}
                created = True
    conn.close()
    return {"token": start_session(user["id"]), "user": public_user(user), "created": created}


@router.get("/me")
def me(authorization: str | None = Header(None)):
    return public_user(user_from_header(authorization))


@router.post("/logout")
def logout(authorization: str | None = Header(None)):
    if authorization and authorization.startswith("Bearer "):
        conn = database.get_connection()
        with conn.cursor() as cur:
            cur.execute("DELETE FROM sessions WHERE token = %s",
                        (authorization.removeprefix("Bearer ").strip(),))
        conn.close()
    return {"message": "Logged out"}


def require_operator(authorization: str | None = Header(None)):
    """Used on endpoints that change the car park set-up (slots, camera source):
    only a logged-in operator may call them."""
    user = user_from_header(authorization)
    if user["role"] != "operator":
        raise HTTPException(403, "Only the operator (admin) can do this")
    return user


def require_user(authorization: str | None = Header(None)):
    """Used on endpoints for any logged-in account (driver or operator), e.g.
    booking a space: the booking then belongs to that account."""
    return user_from_header(authorization)


# ---------- profile (Settings page) ----------

class ProfileIn(BaseModel):
    full_name: str


class PasswordIn(BaseModel):
    current_password: str = ""  # not needed when a Google account sets its first password
    new_password: str


@router.put("/me")
def update_profile(body: ProfileIn, authorization: str | None = Header(None)):
    user = user_from_header(authorization)
    name = body.full_name.strip()
    if len(name) < 2:
        raise HTTPException(400, "Please enter your full name")
    conn = database.get_connection()
    with conn.cursor() as cur:
        cur.execute("UPDATE users SET full_name = %s WHERE id = %s", (name, user["id"]))
    conn.close()
    return public_user({**user, "full_name": name})


@router.post("/password")
def change_password(body: PasswordIn, authorization: str | None = Header(None)):
    user = user_from_header(authorization)
    # a Google-only account has no password yet: it may set one without the old one
    if user["password_hash"] and not check_password(body.current_password, user["password_hash"]):
        raise HTTPException(400, "Your current password is wrong")
    if len(body.new_password) < 6:
        raise HTTPException(400, "New password must be at least 6 characters")
    conn = database.get_connection()
    with conn.cursor() as cur:
        cur.execute("UPDATE users SET password_hash = %s WHERE id = %s",
                    (hash_password(body.new_password), user["id"]))
        # log out every OTHER device: keep only the session making this request
        token = authorization.removeprefix("Bearer ").strip()
        cur.execute("DELETE FROM sessions WHERE user_id = %s AND token <> %s", (user["id"], token))
    conn.close()
    return {"message": "Password changed" if user["password_hash"] else "Password set"}

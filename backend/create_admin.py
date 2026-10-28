"""Create or promote a ResolveIT admin account (idempotent, data-preserving).

Usage (from the project root, with the backend virtualenv active):

    python -m backend.create_admin <username>                 # promote existing user
    python -m backend.create_admin <username> --new           # create a new admin
    python -m backend.create_admin <username> --demote        # demote back to "user"

Existing users keep their password, email, and complaints when promoted or
demoted. Nothing is deleted. The password prompt is hidden from shell history.
"""

import argparse
import getpass
import sys

from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.database import engine
from backend.models.complaint import Complaint
from backend.models.user import User
from backend.security import hash_password

VALID_ROLES = ("user", "staff", "admin")


def main() -> int:
    parser = argparse.ArgumentParser(
        prog="python -m backend.create_admin",
        description="Create, promote, or demote a ResolveIT admin account.",
    )
    parser.add_argument("username", help="Existing username, or new name with --new")
    parser.add_argument(
        "--new",
        action="store_true",
        help="Create the account if it does not exist yet (requires a password)",
    )
    parser.add_argument(
        "--demote",
        action="store_true",
        help="Change the user's role back to 'user' instead of promoting",
    )
    parser.add_argument("--email", help="Email for a newly created account")
    parser.add_argument("--full-name", help="Full name for a newly created account")
    args = parser.parse_args()

    with Session(engine) as session:
        user = session.query(User).filter(User.username == args.username).first()

        if user is None:
            if not args.new:
                print(
                    f"No user '{args.username}' found. "
                    "Register them in the app first, or rerun with --new to create the account."
                )
                return 1
            password = getpass.getpass(f"Password for new admin '{args.username}': ")
            confirm = getpass.getpass("Confirm password: ")
            if not password or password != confirm:
                print("Passwords do not match or are empty. Aborting.")
                return 1
            user = User(
                username=args.username,
                password=hash_password(password),
                email=args.email or f"{args.username}@example.com",
                full_name=args.full_name or args.username,
                role="user",
            )
            session.add(user)
            session.commit()
            session.refresh(user)
            action = "Created"
        else:
            action = "Updated"

        previous_role = "user" if action == "Created" else user.role
        user.role = "user" if args.demote else "admin"
        session.commit()

        try:
            owned = (
                session.query(func.count(Complaint.id))
                .filter(Complaint.user_id == user.id)
                .scalar()
                or 0
            )
        except Exception:
            owned = "unknown"

        print(
            f"{action} user '{user.username}' (id={user.id}): "
            f"role {previous_role} -> {user.role}. Complaints owned: {owned}"
        )
        if user.role == "admin":
            print("Sign in with this account to access User Management.")
        return 0


if __name__ == "__main__":
    sys.exit(main())

"""Run periodic lifecycle jobs against the shared database."""
import argparse
import logging
import time

from backend.community import run_jobs
from backend.core import engine
from backend.payments import process_refunds


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    while True:
        try:
            with engine.begin() as conn:
                run_jobs(conn)
            process_refunds()
        except Exception as error:
            if args.once:
                raise
            logging.error("Periodic booking job failed (%s). Retrying.", type(error).__name__)
        if args.once:
            return
        time.sleep(30)


if __name__ == "__main__":
    main()

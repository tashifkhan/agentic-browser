from mcp_server import server as mcp
from api.run import run as api_run
import argparse
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()


def main():
    parser = argparse.ArgumentParser(
        description="Start API or MCP server",
    )

    group = parser.add_mutually_exclusive_group()

    group.add_argument(
        "-a",
        "--api",
        action="store_true",
        help="Run as API server",
    )

    group.add_argument(
        "-m",
        "--mcp",
        action="store_true",
        help="Run as MCP server",
    )

    parser.add_argument(
        "-y",
        "--yes",
        action="store_true",
        help="Non-interactive: default to API if no mode provided",
    )

    args = parser.parse_args()

    if args.api:
        api_run()
    elif args.mcp:
        mcp.run()
    else:
        if args.yes:
            api_run()
        else:
            choice = input("Run as (1) API server or (2) MCP server? Enter 1 or 2: ")
            if choice == "1":
                api_run()
            else:
                mcp.run()


if __name__ == "__main__":
    main()

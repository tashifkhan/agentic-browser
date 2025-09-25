from mcp_server import server
import app.run


if __name__ == "__main__":
    if (
        choice := input("Run as (1) API server or (2) MCP server? Enter 1 or 2: ")
        == "1"
    ):
        app.run.run()
    else:
        server.run()

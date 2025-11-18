import uvicorn


def run(host: str = "0.0.0.0", port: int = 5454, reload: bool = True):
    uvicorn.run(
        "app.main:app",
        host=host,
        port=port,
        reload=reload,
    )


if __name__ == "__main__":
    run()

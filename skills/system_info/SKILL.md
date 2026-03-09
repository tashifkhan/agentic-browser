---
name: System Info Skill
description: Retrieves system information using bash and python.
---

# System Information Skill

## Goal
You have been asked to retrieve basic system and environment information.

## Steps
1. Use the `bash_agent` to run `uname -a` to get the OS information.
2. Use the `python_agent` to run a short script that imports `sys` and prints `sys.version` to get the Python version.
3. If the user provided a specific prompt, try to answer that prompt using the tools at your disposal, but prioritize the OS and Python version.

If you hit any errors, return the error nicely to the user.

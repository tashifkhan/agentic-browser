import asyncio
import subprocess
from typing import Optional

from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

class BashToolInput(BaseModel):
    command: str = Field(..., description="The bash command to execute.")
    timeout: Optional[int] = Field(default=30, description="The maximum execution time in seconds.")

async def _bash_tool(command: str, timeout: int = 30) -> str:
    try:
        def run_cmd():
            result = subprocess.run(
                command,
                shell=True,
                capture_output=True,
                text=True,
                timeout=timeout
            )
            output = ""
            if result.stdout:
                output += f"STDOUT:\n{result.stdout}\n"
            if result.stderr:
                output += f"STDERR:\n{result.stderr}\n"
            
            if result.returncode != 0:
                output += f"\nCommand failed with exit code: {result.returncode}"
            else:
                output += f"\nCommand finished successfully."
                
            return output.strip() or "Command completed with no output."

        return await asyncio.to_thread(run_cmd)
        
    except subprocess.TimeoutExpired:
        return f"Command timed out after {timeout} seconds."
    except Exception as e:
        return f"Error executing bash command: {str(e)}"

bash_agent = StructuredTool(
    name="bash_agent",
    description="Execute arbitrary bash commands. Use this to interact with the file system, run scripts, or perform system operations.",
    coroutine=_bash_tool,
    args_schema=BashToolInput,
)

__all__ = ["bash_agent", "BashToolInput"]

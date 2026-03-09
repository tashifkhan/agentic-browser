import asyncio
import subprocess
import tempfile
import ast
import os
from typing import Optional

from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

class PythonToolInput(BaseModel):
    code: str = Field(..., description="The python code to execute. Can be a script or snippet.")
    timeout: Optional[int] = Field(default=30, description="The maximum execution time in seconds.")

async def _python_tool(code: str, timeout: int = 30) -> str:
    try:
        def run_code():
            # Basic static analysis to prevent obviously dangerous code (optional, but good practice)
            try:
                ast.parse(code)
            except SyntaxError as e:
                return f"SyntaxError in provided code: {e}"

            with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
                f.write(code)
                temp_filename = f.name
            
            try:
                result = subprocess.run(
                    ["python", temp_filename],
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
                    output += f"\nScript failed with exit code: {result.returncode}"
                else:
                    output += f"\nScript finished successfully."
                    
                return output.strip() or "Script completed with no output."
            finally:
                try:
                    os.unlink(temp_filename)
                except Exception:
                    pass

        return await asyncio.to_thread(run_code)
        
    except subprocess.TimeoutExpired:
        return f"Python script timed out after {timeout} seconds."
    except Exception as e:
        return f"Error executing python code: {str(e)}"

python_agent = StructuredTool(
    name="python_agent",
    description="Execute arbitrary Python code. Code is executed in a temporary file. Standard output and errors are returned.",
    coroutine=_python_tool,
    args_schema=PythonToolInput,
)

__all__ = ["python_agent", "PythonToolInput"]

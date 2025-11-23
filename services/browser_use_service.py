from typing import Dict, Any, Optional

from core import get_logger
from core.llm import llm
from prompts.browser_use import SCRIPT_PROMPT
from utils.agent_sanitizer import sanitize_json_actions

logger = get_logger(__name__)


class AgentService:
    async def generate_script(
        self,
        goal: str,
        target_url: str = "",
        dom_structure: Dict[str, Any] = {},
        constraints: Dict[str, Any] = {},
    ) -> Dict[str, Any]:
        """Generate a JSON action plan for the agent based on the goal and DOM structure."""
        try:
            # Format DOM structure for the prompt
            dom_info = ""
            if dom_structure:
                dom_info = f"\n\n=== PAGE INFORMATION ===\n"
                dom_info += f"URL: {dom_structure.get('url', target_url)}\n"
                dom_info += f"Title: {dom_structure.get('title', 'Unknown')}\n\n"

                interactive = dom_structure.get("interactive", [])
                if interactive:
                    dom_info += (
                        f"=== INTERACTIVE ELEMENTS ({len(interactive)} found) ===\n"
                    )
                    for i, elem in enumerate(
                        interactive[:30], 1
                    ):  # Limit to 30 to avoid token limits
                        dom_info += f"\n{i}. {elem.get('tag', 'unknown')}"
                        if elem.get("id"):
                            dom_info += f" id=\"{elem['id']}\""
                        if elem.get("class"):
                            dom_info += f" class=\"{elem['class']}\""
                        if elem.get("type"):
                            dom_info += f" type=\"{elem['type']}\""
                        if elem.get("placeholder"):
                            dom_info += f" placeholder=\"{elem['placeholder']}\""
                        if elem.get("name"):
                            dom_info += f" name=\"{elem['name']}\""
                        if elem.get("ariaLabel"):
                            dom_info += f" aria-label=\"{elem['ariaLabel']}\""
                        if elem.get("text"):
                            dom_info += f"\n   Text: {elem['text'][:80]}"
                    dom_info += "\n"

            user_prompt = (
                f"Goal: {goal}\n"
                f"Target URL: {target_url}\n"
                f"Constraints: {constraints}"
                f"{dom_info}\n\n"
                "IMPORTANT: Analyze the goal carefully:\n"
                "- If the goal involves opening/closing/switching tabs or navigating to URLs, use TAB CONTROL actions\n"
                "- If the goal involves interacting with page elements (clicking, typing), use DOM actions\n"
                "- If the goal requires both (e.g., 'open new tab and search'), combine both action types\n\n"
                "⚠️ CRITICAL FOR SEARCHES:\n"
                "- When user wants to 'search for X' or 'open new tab and search for X':\n"
                "  → Use OPEN_TAB with the complete search URL (e.g., https://www.google.com/search?q=X)\n"
                "  → DO NOT open chrome://newtab or about:blank and then try to type - this FAILS\n"
                "  → Encode spaces in URL as '+' or '%20'\n"
                "- Only use TYPE/CLICK actions if the target is a real website (http/https), not chrome:// pages\n\n"
                "Based on the page structure, generate the most accurate JSON action plan."
            )

            # Invoke LLM
            # Note: SCRIPT_PROMPT is a ChatPromptTemplate. We pipe it to the LLM.
            # Assuming core.llm.llm is a compatible LangChain LLM/ChatModel.
            chain = SCRIPT_PROMPT | llm
            response = await chain.ainvoke({"input": user_prompt})

            result = response.content if hasattr(response, "content") else str(response)

            # Sanitize and validate
            action_plan, problems = sanitize_json_actions(result)

            if problems:
                logger.warning(f"Action plan validation failed: {problems}")
                return {
                    "ok": False,
                    "error": "Action plan failed validation.",
                    "problems": problems,
                    "raw_response": result[:1000],
                }

            return {"ok": True, "action_plan": action_plan}

        except Exception as e:
            logger.exception(f"Error generating script: {e}")
            return {"ok": False, "error": str(e)}

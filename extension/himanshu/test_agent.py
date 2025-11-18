"""
Test script for the AI Agent System

This script tests the agent tools with mock WebSocket callbacks.
Run this to verify the agent system is properly configured.

Usage:
    python test_agent.py
"""

import asyncio
import json
from agents.agent import agent, set_websocket_callback, tools

# Mock WebSocket callback for testing
async def mock_websocket_callback(action_type: str, params: dict) -> dict:
    """
    Mock callback that simulates browser responses
    In production, this is replaced with real WebSocket communication
    """
    print(f"\n🔧 Tool Call: {action_type}")
    print(f"   Parameters: {json.dumps(params, indent=2)}")
    
    # Simulate responses for different tool types
    mock_responses = {
        "GET_PAGE_INFO": {
            "success": True,
            "data": {
                "url": "https://example.com",
                "title": "Example Page",
                "hasForm": True,
                "interactive": [
                    {"tag": "button", "id": "submit", "text": "Submit"},
                    {"tag": "input", "type": "text", "id": "email"}
                ]
            }
        },
        "CLICK": {
            "success": True,
            "message": f"Clicked element: {params.get('selector')}"
        },
        "TYPE": {
            "success": True,
            "message": f"Typed text into: {params.get('selector')}"
        },
        "OPEN_TAB": {
            "success": True,
            "tabId": 123,
            "url": params.get('url')
        },
        "NAVIGATE": {
            "success": True,
            "message": f"Navigated to: {params.get('url')}"
        },
        "SCROLL": {
            "success": True,
            "message": f"Scrolled {params.get('direction', 'down')}"
        },
        "GET_ALL_TABS": {
            "success": True,
            "tabs": [
                {"id": 1, "url": "https://google.com", "title": "Google", "active": True},
                {"id": 2, "url": "https://github.com", "title": "GitHub", "active": False}
            ]
        }
    }
    
    # Return appropriate mock response
    response = mock_responses.get(action_type, {
        "success": True,
        "message": f"Mock execution of {action_type}"
    })
    
    print(f"   Response: {json.dumps(response, indent=2)}")
    return response


def test_individual_tools():
    """Test each tool individually"""
    print("\n" + "="*60)
    print("🧪 TESTING INDIVIDUAL TOOLS")
    print("="*60)
    
    # Set mock callback
    set_websocket_callback(mock_websocket_callback)
    
    test_cases = [
        {
            "name": "get_page_info",
            "tool": tools[0],
            "args": {"include_dom": True}
        },
        {
            "name": "click_element",
            "tool": tools[2],
            "args": {"selector": "#submit-button", "wait_after": 500}
        },
        {
            "name": "type_text",
            "tool": tools[3],
            "args": {"selector": "#email", "text": "test@example.com", "clear_first": True, "press_enter": False}
        },
        {
            "name": "open_new_tab",
            "tool": tools[8],
            "args": {"url": "https://google.com", "activate": True}
        },
        {
            "name": "scroll_page",
            "tool": tools[7],
            "args": {"direction": "down", "amount": 500, "to_element": None}
        }
    ]
    
    results = []
    for test in test_cases:
        print(f"\n{'─'*60}")
        print(f"Testing: {test['name']}")
        print(f"{'─'*60}")
        
        try:
            result = test['tool'].invoke(test['args'])
            print(f"\n✅ Result:\n{result}")
            results.append({"tool": test['name'], "status": "PASS", "result": result})
        except Exception as e:
            print(f"\n❌ Error: {str(e)}")
            results.append({"tool": test['name'], "status": "FAIL", "error": str(e)})
    
    # Summary
    print("\n" + "="*60)
    print("📊 TOOL TEST SUMMARY")
    print("="*60)
    passed = sum(1 for r in results if r['status'] == 'PASS')
    failed = sum(1 for r in results if r['status'] == 'FAIL')
    print(f"\nPassed: {passed}/{len(results)}")
    print(f"Failed: {failed}/{len(results)}")
    
    for result in results:
        status_icon = "✅" if result['status'] == 'PASS' else "❌"
        print(f"{status_icon} {result['tool']}: {result['status']}")
    
    return all(r['status'] == 'PASS' for r in results)


def test_agent_execution():
    """Test full agent execution with simple goal"""
    print("\n" + "="*60)
    print("🤖 TESTING AGENT EXECUTION")
    print("="*60)
    
    # Set mock callback
    set_websocket_callback(mock_websocket_callback)
    
    test_goals = [
        "Get information about the current page",
        "Open a new tab and go to Google",
        "Click the submit button on the page"
    ]
    
    for i, goal in enumerate(test_goals, 1):
        print(f"\n{'─'*60}")
        print(f"Test {i}: {goal}")
        print(f"{'─'*60}")
        
        try:
            result = agent.invoke({
                "input": goal
            })
            
            print(f"\n✅ Agent Output:")
            print(result.get('output', str(result)))
            print(f"\n📊 Intermediate Steps: {len(result.get('intermediate_steps', []))}")
            
        except Exception as e:
            print(f"\n❌ Agent Error: {str(e)}")
            return False
    
    return True


def test_error_handling():
    """Test error handling in tools"""
    print("\n" + "="*60)
    print("🛡️ TESTING ERROR HANDLING")
    print("="*60)
    
    # Callback that simulates errors
    async def error_callback(action_type: str, params: dict) -> dict:
        print(f"\n🔧 Simulating error for: {action_type}")
        return {
            "success": False,
            "error": f"Mock error: {action_type} failed"
        }
    
    set_websocket_callback(error_callback)
    
    try:
        result = tools[2].invoke({"selector": "#nonexistent"})  # click_element
        result_dict = json.loads(result)
        
        if not result_dict.get('success'):
            print(f"\n✅ Error properly handled: {result_dict.get('error')}")
            return True
        else:
            print(f"\n❌ Error not detected")
            return False
            
    except Exception as e:
        print(f"\n❌ Unexpected exception: {str(e)}")
        return False


def main():
    """Run all tests"""
    print("\n")
    print("╔" + "="*58 + "╗")
    print("║" + " "*15 + "AI AGENT SYSTEM TESTS" + " "*22 + "║")
    print("╚" + "="*58 + "╝")
    
    tests = [
        ("Individual Tools", test_individual_tools),
        ("Agent Execution", test_agent_execution),
        ("Error Handling", test_error_handling)
    ]
    
    results = []
    for name, test_func in tests:
        try:
            success = test_func()
            results.append((name, success))
        except Exception as e:
            print(f"\n❌ Test suite '{name}' crashed: {str(e)}")
            results.append((name, False))
    
    # Final summary
    print("\n" + "="*60)
    print("🏁 FINAL TEST SUMMARY")
    print("="*60)
    
    for name, success in results:
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status}: {name}")
    
    total_passed = sum(1 for _, success in results if success)
    total_tests = len(results)
    
    print(f"\nOverall: {total_passed}/{total_tests} test suites passed")
    
    if total_passed == total_tests:
        print("\n🎉 All tests passed! Agent system is ready.")
        return 0
    else:
        print("\n⚠️  Some tests failed. Please check the output above.")
        return 1


if __name__ == "__main__":
    exit(main())

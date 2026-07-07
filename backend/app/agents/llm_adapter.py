import os
import json
from contextvars import ContextVar
from groq import Groq
from fastapi import HTTPException
from app.config import settings

# Thread-safe context keys mapped from frontend headers
active_groq_key: ContextVar[str] = ContextVar("active_groq_key", default="")
active_anthropic_key: ContextVar[str] = ContextVar("active_anthropic_key", default="")

class MessagesMock:
    def __init__(self, api_key: str):
        self.groq_client = Groq(api_key=api_key)
        self.groq_model = "llama-3.3-70b-versatile"
        try:
            models_list = self.groq_client.models.list()
            available_ids = [m.id for m in models_list.data]
            
            preferred_models = [
                "llama-3.3-70b-versatile",
                "llama-3.3-70b-specdec",
                "llama-3.1-70b-versatile",
                "llama-3.1-8b-instant",
                "llama3-70b-8192"
            ]
            for pref in preferred_models:
                if pref in available_ids:
                    self.groq_model = pref
                    break
            else:
                # Fallback to any model containing "llama"
                llama_ids = [m_id for m_id in available_ids if "llama" in m_id.lower()]
                if llama_ids:
                    # Prefer models with "70b" in their name if present
                    llama_70b = [m_id for m_id in llama_ids if "70b" in m_id.lower()]
                    self.groq_model = llama_70b[0] if llama_70b else llama_ids[0]
            print(f"DEBUG LLM_ADAPTER: Dynamically selected active Groq model: '{self.groq_model}'")
        except Exception as e:
            print(f"DEBUG LLM_ADAPTER: Failed to query Groq models list (using fallback): {e}")

    def create(self, model, messages, max_tokens=1024, temperature=0.7, system=None, tools=None, tool_choice=None):
        formatted_messages = []
        if system:
            formatted_messages.append({"role": "system", "content": system})

        for msg in messages:
            content = msg.get("content", "")
            if isinstance(content, list):
                text_parts = []
                for item in content:
                    if item.get("type") == "text":
                        text_parts.append(item.get("text", ""))
                content = "\n".join(text_parts)
            formatted_messages.append({"role": msg.get("role", "user"), "content": content})

        formatted_tools = None
        if tools:
            formatted_tools = []
            for t in tools:
                formatted_tools.append({
                    "type": "function",
                    "function": {
                        "name": t["name"],
                        "description": t["description"],
                        "parameters": t["input_schema"]
                    }
                })

        groq_tool_choice = None
        if tool_choice:
            if tool_choice.get("type") == "any":
                groq_tool_choice = "required"
            elif tool_choice.get("type") == "tool":
                groq_tool_choice = {"type": "function", "function": {"name": tool_choice.get("name")}}

        params = {
            "model": self.groq_model,
            "messages": formatted_messages,
            "temperature": temperature,
            "max_tokens": max_tokens
        }
        if formatted_tools:
            params["tools"] = formatted_tools
        if groq_tool_choice:
            params["tool_choice"] = groq_tool_choice

        try:
            # Call Groq chat completion API
            response = self.groq_client.chat.completions.create(**params)
            choice = response.choices[0]
            text_content = choice.message.content or ""
            tool_calls = choice.message.tool_calls
            stop_reason = choice.finish_reason

            if stop_reason == "tool_calls":
                stop_reason = "tool_use"
            elif stop_reason == "stop":
                stop_reason = "end_turn"

            class ContentWrapper:
                def __init__(self, text="", calls=None):
                    self.text = text
                    if calls:
                        self.type = "tool_use"
                        self.id = calls[0].id
                        self.name = calls[0].function.name
                        self.input = json.loads(calls[0].function.arguments)
                    else:
                        self.type = "text"

            class ResponseWrapper:
                def __init__(self, text, calls, reason):
                    self.content = [ContentWrapper(text, calls)]
                    self.stop_reason = reason

            return ResponseWrapper(text_content, tool_calls, stop_reason)
        except Exception as e:
            # Propagate exception to the client
            raise HTTPException(status_code=500, detail=f"Groq API Call Failed: {str(e)}")

class Anthropic:
    def __init__(self, api_key: str = None):
        self.passed_key = api_key
        self.is_groq = True

    @property
    def messages(self):
        from fastapi import HTTPException
        req_groq = active_groq_key.get()
        env_key = os.getenv("GROQ_API_KEY")
        key = self.passed_key or req_groq or env_key

        print(f"DEBUG LLM_ADAPTER: req_groq='{req_groq[:8] if req_groq else ''}' (len: {len(req_groq) if req_groq else 0}), env_key='{env_key[:8] if env_key else ''}' (len: {len(env_key) if env_key else 0}), passed_key='{self.passed_key[:8] if self.passed_key else ''}'")

        # Check if a valid Groq key format exists
        is_groq = key and (key.startswith("gsk_") or "groq" in key.lower() or len(key) > 36)
        if not is_groq:
            raise HTTPException(
                status_code=400,
                detail="Groq API Key is not configured. Please paste your Groq API Key in Settings > Email Connections to run the agent."
            )
        return MessagesMock(key)

"""Wraps emergentintegrations LlmChat for the 3 search engines we test."""
from __future__ import annotations

import os
from typing import Optional

from emergentintegrations.llm.chat import LlmChat, UserMessage

# Engine label -> (provider, model_id)
ENGINES = {
    "gpt-5.2": ("openai", "gpt-5"),
    "claude-sonnet-4.5": ("anthropic", "claude-sonnet-4-5-20250929"),
    "gemini-3-flash": ("gemini", "gemini-2.5-flash"),
}


async def ask_engine(engine: str, system_prompt: str, user_prompt: str, session_id: Optional[str] = None) -> str:
    """Send a single question to the named engine and return raw text response."""
    if engine not in ENGINES:
        raise ValueError(f"Unknown engine {engine}")
    provider, model = ENGINES[engine]
    api_key = os.environ["EMERGENT_LLM_KEY"]
    chat = (
        LlmChat(
            api_key=api_key,
            session_id=session_id or f"{engine}-session",
            system_message=system_prompt,
        )
        .with_model(provider, model)
        .with_params(max_tokens=1024)
    )
    msg = UserMessage(text=user_prompt)
    response = await chat.send_message(msg)
    if isinstance(response, str):
        return response
    return str(response)


def detect_mentions(response: str, brand_terms: list[str]) -> bool:
    lower = response.lower()
    return any(term.strip().lower() in lower for term in brand_terms if term.strip())


def extract_competitor_mentions(response: str, competitor_handles: list[str]) -> list[str]:
    lower = response.lower()
    return sorted({c for c in competitor_handles if c.strip() and c.lower() in lower})

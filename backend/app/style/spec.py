from typing import Literal, Optional
from pydantic import BaseModel
from app.agents.llm_adapter import Anthropic
from app.config import settings

# Initialize client placeholder removed (initialized inside function).

class StyleSpec(BaseModel):
    tone: Literal["formal", "casual", "neutral", "match_sender"] = "neutral"
    font_family: str = "Arial"
    font_size_pt: int = 11
    text_color: str = "#000000"
    accent_color: Optional[str] = None
    line_spacing: float = 1.15
    paragraph_indent_px: int = 0
    include_signature: bool = True
    signature_profile_id: Optional[str] = None
    bullet_style: Literal["dash", "dot", "numbered"] = "dot"


def parse_style_instruction(instruction: str, groq_api_key: str = "") -> StyleSpec:
    """Converts free text like 'make it formal, blue headers, add my
    signature, use Calibri' into a structured StyleSpec via forced tool-call
    output — never letting the model hand-write formatting freeform."""
    
    # Handle mock key fallback
    import os
    has_groq = (groq_api_key and len(groq_api_key) > 10) or os.getenv("GROQ_API_KEY")
    if not has_groq:
        return StyleSpec()

    client = Anthropic(api_key=groq_api_key)

    response = client.messages.create(
        model="claude-3-5-sonnet-20241022",
        max_tokens=300,
        system="Extract formatting instructions into the StyleSpec schema. "
               "If a field isn't mentioned, omit it (defaults apply). Only extract "
               "explicit or strongly implied preferences — do not invent ones the user didn't state.",
        messages=[{"role": "user", "content": instruction}],
        tools=[{
            "name": "submit_style",
            "description": "Submit the parsed style specification",
            "input_schema": StyleSpec.model_json_schema()
        }],
        tool_choice={"type": "tool", "name": "submit_style"}
    )
    parsed = next(b.input for b in response.content if b.type == "tool_use")
    return StyleSpec(**parsed)

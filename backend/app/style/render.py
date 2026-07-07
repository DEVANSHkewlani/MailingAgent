import os
import markdown
from typing import Any
from jinja2 import Environment, FileSystemLoader
from app.style.spec import StyleSpec

# Build template path relative to the file location to make it directory-agnostic
TEMPLATE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "templates")
jinja_env = Environment(loader=FileSystemLoader(TEMPLATE_DIR))

def render_styled_html(body_markdown: str, style: Any, signature_html: str = "",
                        outlook_safe: bool = False) -> str:
    """
    Renders styled HTML email markup using Markdown body text and formatting specifications.
    Accepts both StyleSpec objects and database dictionary structures.
    """
    body_html = markdown.markdown(body_markdown)
    
    # If style is a dict (e.g. returned by get_style_profile), map it to StyleSpec
    if isinstance(style, dict):
        font_size = style.get("font_size")
        if font_size is None:
            font_size = 11
        else:
            try:
                font_size = int(font_size)
            except ValueError:
                font_size = 11

        style_obj = StyleSpec(
            font_family=style.get("font_family") or "Arial",
            font_size_pt=font_size,
            accent_color=style.get("accent_color"),
            tone=style.get("tone") or "neutral"
        )
        if not signature_html:
            signature_html = style.get("signature_html") or ""
        style = style_obj

    template_name = "email_outlook_safe.html.j2" if outlook_safe else "email_base.html.j2"
    template = jinja_env.get_template(template_name)
    
    return template.render(
        body=body_html,
        font_family=style.font_family,
        font_size=style.font_size_pt,
        color=style.text_color,
        accent=style.accent_color or "#1F4E79",
        line_height=style.line_spacing,
        indent=style.paragraph_indent_px,
        signature=signature_html if style.include_signature else "",
    )

from typing import Annotated
from langgraph.graph import MessagesState, add_messages
from langchain_core.messages import AnyMessage

class ResetList(list):
    """A special list subclass used to signal that the state list should be reset/overwritten."""
    pass

def reduce_list(left: list, right: list) -> list:
    """Reducer that appends lists, but resets/overwrites if the update is a ResetList."""
    if right is None:
        return left or []
    if isinstance(right, ResetList):
        return list(right)
    return (left or []) + right

class MailAgentState(MessagesState):
    user_id: str
    conversation_id: str
    instruction: str
    plan: list[dict]

    # These fields are written by MULTIPLE parallel worker agents.
    active_tasks: Annotated[list[dict], reduce_list] = []
    completed_tasks: Annotated[list[dict], reduce_list] = []
    pending_approvals: Annotated[list[dict], reduce_list] = []
    email_context: Annotated[list[dict], reduce_list] = []
    draft_results: Annotated[list[dict], reduce_list] = []
    calendar_results: Annotated[list[dict], reduce_list] = []
    summaries: Annotated[list[dict], reduce_list] = []
    errors: Annotated[list[dict], reduce_list] = []

    # Single-writer fields
    style_profile: dict = {}
    groq_api_key: str = ""
    # When True, the permission gate auto-approves ALL actions without human interrupt.
    # Set to True for unattended cron-triggered graph executions.
    is_cron: bool = False

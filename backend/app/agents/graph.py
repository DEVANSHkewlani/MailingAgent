from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

from app.agents.state import MailAgentState
from app.agents.supervisor import supervisor_node, route_to_workers
from app.agents.reader import reader_agent_node
from app.agents.categorizer import categorizer_agent_node
from app.agents.summarizer import summarizer_agent_node
from app.agents.drafter import drafter_agent_node
from app.agents.scheduler import scheduler_agent_node
from app.agents.reminder import reminder_agent_node
from app.agents.cron_agent import cron_agent_node
from app.permissions.policy import permission_gate_node, needs_human_approval
from app.agents.executor import tool_executor_node
from app.agents.aggregator import aggregator_node

WORKER_NODES = ["reader", "categorizer", "summarizer", "drafter", "scheduler", "reminder", "cron_manager"]

def route_from_reader(state: MailAgentState) -> list[str]:
    """
    Called after reader node completes. Returns list of remaining worker nodes
    in the plan that need to execute, or ["permission_gate"] if none.
    """
    workers = {task["worker"] for task in state["plan"]}
    remaining_workers = workers - {"reader"}
    return list(remaining_workers) if remaining_workers else ["permission_gate"]

def build_graph(checkpointer):
    graph = StateGraph(MailAgentState)

    graph.add_node("supervisor", supervisor_node)
    graph.add_node("reader", reader_agent_node)
    graph.add_node("categorizer", categorizer_agent_node)
    graph.add_node("summarizer", summarizer_agent_node)
    graph.add_node("drafter", drafter_agent_node)
    graph.add_node("scheduler", scheduler_agent_node)
    graph.add_node("reminder", reminder_agent_node)
    graph.add_node("cron_manager", cron_agent_node)
    graph.add_node("permission_gate", permission_gate_node)
    graph.add_node("executor", tool_executor_node)
    graph.add_node("aggregator", aggregator_node)

    graph.add_edge(START, "supervisor")

    # Supervisor fans out to 1..N workers in parallel based on the plan
    graph.add_conditional_edges("supervisor", route_to_workers, WORKER_NODES)

    # Reader routes conditionally to other workers, or directly to permission_gate if done
    graph.add_conditional_edges(
        "reader",
        route_from_reader,
        {
            "categorizer": "categorizer",
            "summarizer": "summarizer",
            "drafter": "drafter",
            "scheduler": "scheduler",
            "reminder": "reminder",
            "cron_manager": "cron_manager",
            "permission_gate": "permission_gate"
        }
    )

    # Non-reader workers converge on permission_gate.
    non_reader_workers = ["categorizer", "summarizer", "drafter", "scheduler", "reminder", "cron_manager"]
    for worker in non_reader_workers:
        graph.add_edge(worker, "permission_gate")

    graph.add_conditional_edges(
        "permission_gate",
        needs_human_approval,
        {"approve_required": END, "auto_approved": "executor"}
    )

    graph.add_edge("executor", "aggregator")
    graph.add_edge("aggregator", END)

    return graph.compile(checkpointer=checkpointer)


_checkpointer_context = None
_checkpointer = None
_compiled_graph = None

async def get_compiled_graph():
    """Call once at app startup; reuse the compiled graph across requests."""
    global _checkpointer_context, _checkpointer, _compiled_graph
    if _compiled_graph is None:
        from app.config import settings
        url = settings.database_url
        if url.startswith("postgresql+asyncpg://"):
            url = url.replace("postgresql+asyncpg://", "postgresql://")
        
        # Keep checkpointer connection pool open globally
        _checkpointer_context = AsyncPostgresSaver.from_conn_string(url)
        _checkpointer = await _checkpointer_context.__aenter__()
        await _checkpointer.setup()  # creates checkpoint tables if missing
        _compiled_graph = build_graph(_checkpointer)
        
    return _compiled_graph

async def close_compiled_graph():
    """Call on application shutdown to clean up connection pools."""
    global _checkpointer_context, _checkpointer, _compiled_graph
    if _checkpointer_context is not None:
        await _checkpointer_context.__aexit__(None, None, None)
        _checkpointer_context = None
        _checkpointer = None
        _compiled_graph = None

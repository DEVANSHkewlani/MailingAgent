import { useState, useCallback } from "react";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
  Cell
} from "recharts";

// ═══════════════════════════════════════════════════════
//  DATA
// ═══════════════════════════════════════════════════════

const toRad = deg => (deg * Math.PI) / 180;
const CX = 520, CY = 420;

const LAYERS = [
  {
    id: "worldmodel", angle: -90, color: "#F59E0B", glow: "#F59E0B50",
    label: "World Model", icon: "🌐", phase: 1,
    tagline: "Living Python object — the system's understanding of reality",
    desc: "Fuses all four memory layers and the live event stream into a single causally-aware, temporally-grounded representation. Not a database — never queried with SQL. The reasoning engine never touches storage directly.",
    stats: [["Components", "9"], ["Update loops", "3"], ["Prediction horizons", "T+5/15/60m"], ["Key latency", "<1ms Redis"]],
    subs: [
      { label: "Entity Registry", color: "#FCD34D", detail: "13-dim state vectors, HW predictions, version control, staleness flags (90s). State-bearing — not just identity records." },
      { label: "Temporal State", color: "#FCD34D", detail: "Rate-of-change, z-score, HW residual per metric. Primary anomaly signal. Four-signal fusion: statistical + HW + rate + prediction." },
      { label: "Causal Chains", color: "#FCD34D", detail: "A→B→C inferred paths assembled from TRIGGERS graph + temporal co-occurrence. Weighted by confidence." },
      { label: "Anomaly Registry", color: "#FCD34D", detail: "All active deviations: severity, blast radius, causal chain match, confidence. Feeds Situation Assessor." },
      { label: "Predictive State", color: "#FCD34D", detail: "T+5/T+15/T+60: Tier 1 Holt-Winters per metric (Phase 1, runs now). Tier 2 GNN per entity (Phase 3, drop-in upgrade, same API)." },
      { label: "Uncertainty Map", color: "#FCD34D", detail: "Per-assertion confidence in Redis. Gets <1ms access. Prevents overconfident decisions. Updated by GLP and perception failures." },
      { label: "Situation Assessor", color: "#F59E0B", detail: "Priority = 0.35×severity + 0.25×blast + 0.20×confidence + 0.10×novelty + 0.10×recency × (1.5 if goal_relevant). Deterministic — no LLM." },
      { label: "Rollout Buffer", color: "#F59E0B", detail: "Pre-simulates ALL candidate actions before LLM sees anything. Scores by cost_delta. LLM's job: choose, not invent. Adds ~2-5s before LLM call." },
      { label: "Cost Function", color: "#F59E0B", detail: "Multiplicative: (severity + ε) × (blast + ε) × (time_pressure + ε) × (uncertainty + ε) × context_multiplier. deployment×1.4, maintenance×0.7." },
    ],
    connections: ["reasoning", "planning"],
  },
  {
    id: "reasoning", angle: -38.6, color: "#10B981", glow: "#10B98140",
    label: "Reasoning", icon: "⚡", phase: 1,
    tagline: "LLM as one bounded component — receives brief, returns decision",
    desc: "The LLM does not perceive, does not maintain memory, does not query databases. It receives a prepared, validated situation brief with pre-scored rollout options and returns a structured decision.",
    stats: [["Routing modes", "6"], ["LLM cost reduction", "60-80%"], ["Max resubmits", "2"], ["Verifier checks", "4"]],
    subs: [
      { label: "Mode Router", color: "#34D399", detail: "6 modes: AWAIT_EVIDENCE / MODE_1_PLAYBOOK / MODE_1_GNN / MODE_2_STANDARD / MODE_2_GNN_HINT / HUMAN_REQUIRED. Two-stage safety check." },
      { label: "Mode 1 Fast-path", color: "#34D399", detail: "No LLM call. Playbook semantic match >0.88 AND success_rate >0.80 AND age <90 days. Wilson CI > 0.80 from procedural memory." },
      { label: "Mode 2 LLM", color: "#34D399", detail: "5-step diagnostic prompt: affected entity → root cause → blast radius → best action → risks. Forces structured reasoning before recommendation." },
      { label: "Hallucination Verifier", color: "#6EE7B7", detail: "4 checks: (1) action in vocabulary, (2) entity exists in WM, (3) blast radius matches graph, (4) confidence calibrated to evidence density. 2 resubmits max." },
      { label: "Multi-Model Strategy", color: "#6EE7B7", detail: "Haiku for simple/high-confidence, Sonnet for complex/moderate, Sonnet+GPT-4o for novel/critical. 60-80% cost reduction vs single-model." },
    ],
  },
  {
    id: "planning", angle: 12.9, color: "#06B6D4", glow: "#06B6D440",
    label: "Planning", icon: "📋", phase: 1,
    tagline: "Simulate before acting — deterministic graph traversal",
    desc: "Converts a reasoning decision into a concrete, executable strategy. Every plan is simulated against the world model before any real action is taken. Failed dry-runs revise the plan, not the execution.",
    stats: [["Simulate hops", "3 + 2"], ["Approval rules", "4 configurable"], ["Rollback", "Mandatory"], ["Task queue", "Celery + idempotency"]],
    subs: [
      { label: "Plan Constructor", color: "#22D3EE", detail: "DAG of PlanSteps: dependencies, success criteria, timeouts, on-failure handlers (abort/retry/skip/escalate/rollback). Validated against Pydantic Decision schema." },
      { label: "simulate()", color: "#22D3EE", detail: "Deterministic BFS: DEPENDS_ON 3-hop + active TRIGGERS 2-hop + CONTENDS_FOR check. REINFORCES edge → hard veto. Cannot predict emergent behaviours not yet in graph." },
      { label: "Policy Engine", color: "#22D3EE", detail: "Configurable rules: DB migration→approval, production+non-critical→dry-run, blast_radius>3→approval, confidence<0.7→approval." },
      { label: "Approval Gates", color: "#67E8F9", detail: "Celery task with idempotency key (Redis-keyed). Slack block notification with full context. Pauses until approve/modify/reject. Decision in audit log." },
      { label: "Rollback Plans", color: "#67E8F9", detail: "Compensating action sequence per step. Irreversible actions WITHOUT rollback plan are rejected by policy engine before submission." },
    ],
  },
  {
    id: "execution", angle: 64.3, color: "#EF4444", glow: "#EF444440",
    label: "Execution", icon: "🔨", phase: 1,
    tagline: "Observable, traceable, idempotent — records before acting",
    desc: "Every action must satisfy three invariants: observable (perception can detect effects), traceable (recorded with correlation_id before acting), and idempotent where possible (calling twice = same result as once).",
    stats: [["Action types", "6"], ["Circuit breakers", "Per layer"], ["Idempotency", "Redis key+TTL"], ["Audit log", "Immutable PostgreSQL"]],
    subs: [
      { label: "API Actions", color: "#FCA5A5", detail: "REST/GraphQL/webhooks, cloud provider APIs (AWS/GCP/Azure). httpx async with retry + circuit breaker. Returns cached result if idempotency key exists." },
      { label: "Process Management", color: "#FCA5A5", detail: "Start/stop/restart services, scale replicas, container + Kubernetes operations. Reads plan_state from Redis for resume/abort after step failures." },
      { label: "Browser Automation", color: "#FCA5A5", detail: "Playwright: click, type, navigate, extract DOM state, screenshot. UI state fed back to perception bus as CognitiveEvents. Rage click + web vitals." },
      { label: "Code Operations", color: "#FCA5A5", detail: "CI triggers, rollback PR generation, git blame queries, deployment annotation in Neo4j. Closes loop between code changes and operational outcomes." },
      { label: "Agent Delegation", color: "#FEE2E2", detail: "Spawn specialist agent (Security, Performance, CostOptimiser). Tasks communicated through Neo4j graph nodes — not direct messaging. Auditable + replayable." },
      { label: "Human Handoff", color: "#FEE2E2", detail: "Pause execution, dispatch structured Slack brief with full situation context. Wait for approve/modify/reject. Decision and rationale recorded in PostgreSQL audit log." },
    ],
  },
  {
    id: "feedback", angle: 115.7, color: "#EC4899", glow: "#EC489940",
    label: "Feedback", icon: "🔄", phase: 1,
    tagline: "What separates a pipeline from an adaptive system",
    desc: "Runs under its own Kafka consumer group (feedback-loop) — separate from world-model — to prevent commit interference. Three things happen after every action: lockout, outcome recording, and model updating.",
    stats: [["Kafka group", "feedback-loop"], ["MAS weights", "0.45+0.35+0.20"], ["Lockout types", "4 action-specific"], ["RL data", "Accumulating from Day 1"]],
    subs: [
      { label: "Intervention Lockout", color: "#F9A8D4", detail: "Redis window per action type: scale_replicas=10m, restart=3m, DNS=60m, default=5m. Situation Assessor penalizes locked entities by 0.15× to prevent duplicate plans." },
      { label: "Outcome Recording", color: "#F9A8D4", detail: "Immutable TimescaleDB: correlation_id, WM snapshot at decision time, decision made, plan executed, steps completed, MTTR. RL training data from Day 1." },
      { label: "RESOLVES Scoring (MAS)", color: "#F9A8D4", detail: "MAS = 0.45×effect_size + 0.35×mechanism_score + 0.20×temporal_score. Adjusted by confounder_risk (concurrent actions, autoscaling, deployments, scheduled jobs)." },
      { label: "Graph Updates", color: "#FBCFE8", detail: "Floor-anchored logarithmic decay: floor = min(0.50, 0.03×ln(obs+1)). Rare incidents preserved in rare_incidents partition — never pruned. Evidence types tagged." },
      { label: "Procedural Updates", color: "#FBCFE8", detail: "Wilson score interval (not naive success rate) updated in Qdrant after each resolved action. Failing strategies deprioritized — not deleted. Mode 1 gate: Wilson LB > 0.80." },
    ],
  },
  {
    id: "perception", angle: 167.1, color: "#3B82F6", glow: "#3B82F640",
    label: "Perception", icon: "👁", phase: 1,
    tagline: "Always-on — adapters collect, normalizers interpret",
    desc: "The system's senses. Two-stage design: Adapters are I/O workers (meaning-agnostic), Normalizers are semantic interpreters (I/O-agnostic). A normalizer that cannot produce a valid CognitiveEvent never silently drops data.",
    stats: [["Source types", "11 (130+ event types)"], ["State fallback", "3-level [C1]"], ["Noise filtered", ">99.9%"], ["Confidence range", "0.40—0.98"]],
    subs: [
      { label: "LogAdapter", color: "#93C5FD", detail: "Kafka consumer of Fluent Bit. Manual commits (only after normalizer succeeds). 3-level state fallback [C1]: live → Redis cached (×0.85) → absent." },
      { label: "MetricAdapter + DatabaseAdapter", color: "#93C5FD", detail: "Alertmanager webhooks + asyncpg direct pg_stat_activity. One batched query at event fire time collects all 13 state dimensions." },
      { label: "API + Queue + Sensor Adapters", color: "#93C5FD", detail: "httpx health polling with SSL cert check, Kafka Admin API lag tracking, aiomqtt subscription. State collection is free — same connection." },
      { label: "9 Normalizers (5-stage pipeline)", color: "#BFDBFE", detail: "Noise elimination → semantic extraction → entity resolution → confidence scoring → token budget enforcement. Produces CognitiveEvent or PerceptionFailure." },
      { label: "TelemetryTrustManager", color: "#BFDBFE", detail: "Source credibility drops 0.10/conflict (floor 0.20). Volume anomaly: 10× baseline → 0.60 confidence multiplier. Keeps low-credibility sources visible to operators." },
    ],
  },
  {
    id: "memory", angle: 218.6, color: "#8B5CF6", glow: "#8B5CF640",
    label: "Memory", icon: "🧠", phase: 1,
    tagline: "Four timescales — the system's continuity across incidents",
    desc: "Without memory, every reasoning step starts from zero. Four distinct memory types serve four different timescales and access patterns. They are not interchangeable — the reasoning engine reads Redis, not TimescaleDB.",
    stats: [["Memory layers", "4"], ["Storage systems", "5 databases"], ["Consolidation", "90d→Concept nodes→S3"], ["SEGTREEMEM", "Novel contribution"]],
    subs: [
      { label: "Working Memory · Redis", color: "#C4B5FD", detail: "Sub-ms: current_situation (30s refresh, TTL 15m), world_model_snapshot (5m), active_goals (no TTL), plan_state, uncertainty_map, gnn:prediction:* keys." },
      { label: "Episodic Memory · TimescaleDB", color: "#C4B5FD", detail: "Permanent hypertable: all CognitiveEvents, reasoning traces, plan executions, outcome records. SEGTREEMEM indexed. Rare incidents partition — never pruned." },
      { label: "Semantic Memory · Neo4j KG", color: "#C4B5FD", detail: "9 relationship types: DEPENDS_ON, TRIGGERS, RESOLVES, HISTORICALLY_CORRELATED, COMMUNICATES_WITH, CONDITIONAL_DEPENDS_ON, CONTENDS_FOR, REINFORCES, EMERGES_WHEN." },
      { label: "Procedural Memory · Qdrant+PG", color: "#DDD6FE", detail: "Strategy library with Wilson confidence intervals. Mode 1 gated at CI > 0.80. ANN similarity retrieval for situation matching. Updated by feedback loop." },
      { label: "SEGTREEMEM · Causal Retrieval", color: "#DDD6FE", detail: "Temporal segment tree over TimescaleDB+Qdrant. Median-timestamp splits (not time midpoint). Burst-protected (5-min floor). Preserves causal neighborhoods — vs flat ANN." },
    ],
  },
];

const SCENARIOS = [
  {
    id: "db_pool", emoji: "🗄️", title: "DB Connection Pool Exhaustion",
    severity: "CRITICAL", tagline: "Postgres at 98% pool — auth-service starting to queue",
    steps: [
      { layer: "perception", label: "T+0s", text: "DatabaseAdapter detects connection_pool_utilization=0.98 via pg_stat_activity. Batched state query collects all 13 dimensions (live source).", badge: "3-level fallback active" },
      { layer: "memory", label: "T+0.045s", text: "GLP queue worker updates Entity node in Neo4j with new 13-dim state vector. TRIGGERS edge to auth-service strengthened — co-occurrence count ++.", badge: "Neo4j write <50ms" },
      { layer: "worldmodel", label: "T+0.046s", text: "Anomaly score = 0.93 (z-score=12.3σ, HW residual=0.47). Causal chain to auth-service assembled. TTF ≈ 0s (pool already at max).", badge: "anomaly_score=0.93" },
      { layer: "worldmodel", label: "T+30s", text: "Rollout Buffer pre-simulates 3 options: scale_replicas(cost 0.82→0.18), restart(→0.31), failover(→0.52, irreversible). LLM receives ranked brief.", badge: "cost_delta best=+0.56" },
      { layer: "reasoning", label: "T+30.5s", text: "Mode 2 (critical severity override). 5-step diagnostic → Claude Sonnet selects Option 1 (scale replicas). Verifier: all 4 checks pass.", badge: "Mode 2 STANDARD" },
      { layer: "planning", label: "T+31s", text: "simulate() confirms: no REINFORCES loop veto, no conflicting plans in-flight, no blast radius overlap. Rollback plan: remove replica (safe, reversible).", badge: "dry-run PASS" },
      { layer: "execution", label: "T+32s", text: "scale_read_replicas 3→5 via Kubernetes API. Idempotency key set in Redis. Action written to TimescaleDB with correlation_id BEFORE executing.", badge: "idempotent write" },
      { layer: "feedback", label: "T+12m", text: "Metrics confirm recovery. MAS score = 0.78 (effect_size=0.91, mechanism=1.0, temporal=1.0, confounder_risk=0.12). RESOLVES edge written. Wilson interval updated.", badge: "RESOLVES confidence=0.78" },
    ],
    outcome: "✅ Resolved in 12 min. Threshold systems: ~45 min (manual). SEGTREEMEM retrieved similar inc_045 → correct action first-try. Mode 1 enabled after this incident (Wilson LB now 0.82).",
    advantage: "Causal chain to auth-service detected automatically via TRIGGERS graph traversal. Counterfactual simulation prevents unnecessary failover (irreversible, 30s downtime).",
  },
  {
    id: "deploy_regression", emoji: "🚀", title: "Post-Deployment Regression (Silent)",
    severity: "HIGH", tagline: "Deploy flag cleared. Error rate spikes 3 min later.",
    steps: [
      { layer: "perception", label: "T-15m", text: "CI/CD sets flag:deployment:svc:payment-service in Redis (TTL=3600s dead-man switch). Primary termination: active deletion on completion.", badge: "C2 lifecycle contract" },
      { layer: "perception", label: "T+0m", text: "Deployment completes. CI/CD actively DELETES the flag (C2 contract). Without C2: flag stays active 40+ more minutes — post-deploy regressions silenced.", badge: "redis.delete(flag)" },
      { layer: "perception", label: "T+3m", text: "MetricAdapter detects error_rate=0.12 on svc:payment-service. Context flag: ABSENT. No deployment suppression. CognitiveEvent severity=HIGH fires.", badge: "context_flag=ABSENT" },
      { layer: "worldmodel", label: "T+3.1m", text: "Deployment-triggered revalidation: all outgoing edges from payment-service flagged PENDING_REVALIDATION, uncertainty widened ×1.5. Blast radius: 4 downstream services.", badge: "uncertainty ×1.5" },
      { layer: "worldmodel", label: "T+3.2m", text: "Error pattern doesn't match any existing playbook → novelty_score=1.0 → Mode 2. SEGTREEMEM retrieves similar post-deploy regression from 90 days ago.", badge: "novelty_score=1.0" },
      { layer: "reasoning", label: "T+4m", text: "Mode 2. LLM sees episode: 'memory leak from dependency upgrade → rollback resolved in 8 min'. Recommends rollback with confidence=0.75.", badge: "Mode 2 STANDARD" },
      { layer: "planning", label: "T+4.5m", text: "Rollback plan generated. simulate() confirms no blast radius overlap. Policy engine: rollback requires approval (irreversible operation). Slack sent.", badge: "approval required" },
      { layer: "feedback", label: "T+15m", text: "Error rate returns to baseline after rollback. New playbook: deployment_regression→rollback_to_previous. Wilson LB=0.65 (needs more data — not yet Mode 1 eligible).", badge: "new playbook created" },
    ],
    outcome: "✅ Correctly caught post-deployment regression that a stale context flag would have silenced for 40+ minutes. MTTD: 3 minutes from code change taking effect.",
    advantage: "Context flag lifecycle contract (C2) is architecturally critical. Without it, even a correct DCA is blind during the highest-risk window immediately after deployments.",
  },
  {
    id: "ddos", emoji: "🛡️", title: "DDoS vs Legitimate Traffic Spike",
    severity: "HIGH", tagline: "8× request spike on checkout — flash sale or attack?",
    steps: [
      { layer: "perception", label: "T+0s", text: "MetricAdapter detects request_rate=8000rps (8× baseline) on svc:checkout. Same event_type as legitimate traffic spikes: high_request_rate. Confidence=0.98.", badge: "ambiguous signal" },
      { layer: "worldmodel", label: "T+0.1s", text: "HW forecast: this rate not predicted (no scheduled campaign in context flags). Anomaly score=0.71, blast radius=3 services. Causal chain is ambiguous.", badge: "anomaly=0.71" },
      { layer: "worldmodel", label: "T+0.2s", text: "SEGTREEMEM retrieves 2 similar episodes: Episode A (DDoS — auth_failure_rate=0.45, novel IPs, zero conversions). Episode B (flash sale — auth_success, known IPs, high conversion).", badge: "2 episodes retrieved" },
      { layer: "worldmodel", label: "T+0.3s", text: "Current state: auth_failure_rate=0.38, novel IP distribution, zero checkout conversions. Matches DDoS causal fingerprint. Rollout Buffer scores WAF rule: cost 0.71→0.18 (+0.53).", badge: "DDoS fingerprint match" },
      { layer: "reasoning", label: "T+1s", text: "Mode 2. LLM receives both episodes + current state vector. Selects DDoS response with confidence=0.82. Reasoning: auth failures + novel IPs + zero conversions = coordinated attack.", badge: "confidence=0.82" },
      { layer: "planning", label: "T+2s", text: "Plan: (1) rate-limit novel IP ranges via WAF, (2) alert Security Specialist agent, (3) alert on-call. simulate() confirms: WAF rule is IP-scoped, no blast radius to legitimate users.", badge: "simulate PASS" },
      { layer: "execution", label: "T+3s", text: "WAF rule deployed via API. SecuritySpecialist agent spawned — task node written to Neo4j. Security Slack channel alerted with full context.", badge: "3s response time" },
      { layer: "feedback", label: "T+8m", text: "Auth failures drop from 0.38 to 0.02. Request rate normalizes. RESOLVES written: MAS=0.85. HISTORICALLY_CORRELATED edge: novel_ips ↔ auth_failure_rate strengthened.", badge: "graph edge strengthened" },
    ],
    outcome: "✅ DDoS identified and mitigated in 3 seconds. A flash sale would have received no intervention (auth_success pattern recognized). Key: causal context from SEGTREEMEM, not just embedding similarity.",
    advantage: "Flat ANN retrieves 'high traffic' events but loses causal context (auth pattern, IP distribution, conversion rate). SEGTREEMEM preserves the causal neighborhood that distinguishes the two scenarios.",
  },
  {
    id: "memory_leak", emoji: "📈", title: "Gradual Memory Leak — Proactive Intervention",
    severity: "WARNING→CRITICAL", tagline: "Memory climbing 0.8%/hour — 6 hours before OOM",
    steps: [
      { layer: "perception", label: "T-6h", text: "MetricAdapter: memory_pct=45%. Within bounds — INFO level. Noise elimination discards it. BUT Holt-Winters HW model is continuously updating in the background.", badge: "noise filtered" },
      { layer: "worldmodel", label: "T-4h", text: "HW detects positive trend drift after AIC crossover (30 observations). rate_of_change=+0.013%/min. Z-score against rolling mean: only 1.8σ — below alert threshold.", badge: "AIC crossover" },
      { layer: "worldmodel", label: "T-2h", text: "predictive_state: TTF=120min. anomaly_score=0.45 (WARNING threshold). Rollout Buffer pre-simulates restart options. Mode 1 not yet eligible (score below threshold).", badge: "TTF=120min" },
      { layer: "worldmodel", label: "T-90m", text: "memory_pct=65%. predictive_state: TTF=75min. anomaly_score=0.62 → crosses Mode 1 threshold. Playbook: 'gradual_memory_growth→restart_with_traffic_drain'. Wilson LB=0.87.", badge: "Mode 1 threshold crossed" },
      { layer: "reasoning", label: "T-88m", text: "Mode 1 PLAYBOOK (no LLM). Playbook match=0.91, success_rate=0.89, age=12 days. All Stage 1 checks pass. Stage 2: confidence=0.87, non-critical severity → MODE_1_PLAYBOOK.", badge: "zero LLM cost" },
      { layer: "planning", label: "T-87m", text: "3-step plan: traffic drain (60s) → graceful restart → traffic restore. simulate() confirms: no blast radius, no REINFORCES loop, no resource contention.", badge: "simulate PASS" },
      { layer: "execution", label: "T-85m", text: "Traffic drained. Service restarted gracefully (15s). Traffic restored. Memory resets to 2%. Auth-service never exceeded 67% memory. Zero user-facing downtime.", badge: "zero downtime" },
      { layer: "feedback", label: "T-75m", text: "HW forecast confirmed: pre-intervention TTF=75min, actual recovery immediate. MAS effect_size=0.97 (massive HW deviation). Playbook confidence rises. Wilson LB now 0.91.", badge: "Wilson LB=0.91" },
    ],
    outcome: "✅ Intervened at 65% memory, 85 minutes before OOM kill. Threshold-based systems trigger at 95% with 2-3 min before crash. DCA prevents the incident entirely — zero downtime.",
    advantage: "Holt-Winters trend detection + predictive TTF = proactive intervention. Reactive systems require the threshold breach to act. DCA prevents incidents; threshold systems react to them.",
  },
  {
    id: "cascade", emoji: "💥", title: "EMERGES_WHEN — Multi-Service Cascade",
    severity: "CRITICAL", tagline: "Cache miss → DB spike → Auth lag → Payment timeout. No single root cause.",
    steps: [
      { layer: "perception", label: "T+0s", text: "MetricAdapter: cache_hit_rate_pct=0.31 (down from 0.92 due to Redis memory eviction). Individually: WARNING. No single-entity threshold breached.", badge: "multi-entity pattern" },
      { layer: "perception", label: "T+45s", text: "DB connection pool climbs as cache misses route directly to Postgres: pool_utilization=0.78. Individually: WARNING. Two WARNINGs, no CRITICAL yet.", badge: "correlated WARNINGs" },
      { layer: "worldmodel", label: "T+90s", text: "CONDITIONAL_DEPENDS_ON edge activates: checkout→postgres depends_on only when cache_hit_rate<50%. Condition met. Blast radius expands to include checkout service.", badge: "conditional edge ACTIVE" },
      { layer: "worldmodel", label: "T+2m", text: "EMERGES_WHEN detector fires: cache(low) + postgres(high) + auth(degraded) — this combination seen 3× previously → cascade. emergence_probability=0.87.", badge: "EMERGES_WHEN fired" },
      { layer: "reasoning", label: "T+2.5m", text: "Mode 2 with EMERGES_WHEN context injected. LLM sees: 'emergent failure pattern, not attributable to any single entity'. Recommends 3-step compound remediation.", badge: "Mode 2 EMERGES" },
      { layer: "planning", label: "T+3m", text: "3-step plan: (1) flush cold Redis keys → (2) scale Postgres replicas → (3) circuit-break payment→checkout. simulate() evaluates all 3 together — checks REINFORCES loop veto.", badge: "compound simulate" },
      { layer: "execution", label: "T+4m", text: "Steps executed sequentially with 30s verification windows. LoopGuard active: causation_chain cap prevents action_completed event from retriggering detection loop.", badge: "LoopGuard active" },
      { layer: "feedback", label: "T+15m", text: "All metrics return to baseline. EMERGES_WHEN edge strengthened — emergence_probability updated to 0.91. Multi-action attribution: sequential not concurrent → attribution_uncertain=false.", badge: "EMERGES_WHEN updated" },
    ],
    outcome: "✅ Emergent cascade detected via EMERGES_WHEN. Classic causal traversal finds no single root cause — would have escalated to human. DCA MTTD: 2.5 min from cascade onset.",
    advantage: "EMERGES_WHEN is the only mechanism that catches coordinated multi-entity failures where no single entity is the root cause. Standard graph traversal misses this entire failure class.",
  },
];

const BENCHMARK_RADAR = [
  { subject: "Root Cause Accuracy", DCA: 88, "Datadog/Grafana": 15, "LLM Copilot": 45 },
  { subject: "Auto-Remediation", DCA: 82, "Datadog/Grafana": 5, "LLM Copilot": 18 },
  { subject: "Causal Depth", DCA: 95, "Datadog/Grafana": 12, "LLM Copilot": 32 },
  { subject: "Self-Improving", DCA: 90, "Datadog/Grafana": 0, "LLM Copilot": 0 },
  { subject: "Proactive Intervention", DCA: 78, "Datadog/Grafana": 0, "LLM Copilot": 8 },
  { subject: "Cost Efficiency", DCA: 85, "Datadog/Grafana": 65, "LLM Copilot": 22 },
  { subject: "Context Continuity", DCA: 95, "Datadog/Grafana": 28, "LLM Copilot": 22 },
  { subject: "Blast Radius Detection", DCA: 92, "Datadog/Grafana": 38, "LLM Copilot": 18 },
];

const BENCHMARK_TABLE = [
  { metric: "Root Cause Match Rate", target: "≥70%", dca: "≥70% (Phase 1 goal)", ddg: "~0% (manual only)", llm: "~40% (no graph)", impl: "Easy" },
  { metric: "MTTD (event → output)", target: "<90s", dca: "<90s (instrumented)", ddg: "N/A (alerts only)", llm: "120-300s", impl: "Medium" },
  { metric: "MTTR (known patterns)", target: "Auto", dca: "~5-15min auto", ddg: "30-60min manual", llm: "20-45min manual", impl: "Hard" },
  { metric: "False Positive Actions", target: "<5%", dca: "<5% (target)", ddg: "N/A", llm: "~20%", impl: "Hard" },
  { metric: "Causal Chain Depth", target: "Multi-hop", dca: "Auto graph traversal", ddg: "Manual topology", llm: "Linguistic only", impl: "Hard" },
  { metric: "Self-Improving", target: "Yes", dca: "✅ Feedback loop", ddg: "❌", llm: "❌ Session only", impl: "Easy" },
  { metric: "Proactive Intervention", target: "TTF-based", dca: "✅ HW TTF prediction", ddg: "❌ Reactive only", llm: "❌", impl: "Medium" },
  { metric: "Context Continuity", target: "Cross-incident", dca: "✅ SEGTREEMEM", ddg: "❌ Stateless", llm: "❌ Session-based", impl: "Hard" },
  { metric: "Multi-entity Cascade", target: "EMERGES_WHEN", dca: "✅ Novel edge type", ddg: "❌", llm: "Possible (unreliable)", impl: "Hard" },
  { metric: "Operational Cost", target: "Low at scale", dca: "Mode 1 = zero LLM", ddg: "Fixed licensing", llm: "100% LLM calls", impl: "Easy" },
];

const PHASES = [
  {
    id: 1, label: "Phase 1", time: "Months 1-3", status: "COMPLETE", color: "#10B981",
    goal: "Live world model. Accurate situation assessments. Plan recommendations a human can review.",
    delivers: ["Schema + Kafka + 7 adapters → 4-layer memory", "World Model + 3 update loops", "Situation Assessor + Rollout Buffer + CostFunction", "Mode 2 LLM reasoning with 4-check verifier", "Template-based planning with human approval gates", "Execution layer with idempotency", "Feedback loop + RESOLVES scoring", "SSE Dashboard on :4000 (observability before chaos)"],
    blockers: ["entity_identity_contract.py enforced at EVERY boundary", "metric_thresholds written by adapters at entity creation", "Mode Router must write to llm_call_log for self-model", "C2 context flag deletion must be in CI/CD pipelines"],
    success: "Root cause hypotheses match expert diagnosis ≥70% of the time",
  },
  {
    id: 2, label: "Phase 2", time: "Months 3-6", status: "PLANNED", color: "#06B6D4",
    goal: "Auto-execute low-risk actions. SEGTREEMEM. Metacognitive monitor. Goal engine.",
    delivers: ["SEGTREEMEM on Qdrant (causal retrieval, Novel contribution)", "Multi-model router by severity/novelty", "Auto-execution for Wilson LB > 0.80 playbooks", "Full feedback loop with graph updating", "ChatOps integration (Slack approval flows)", "Metacognitive monitor (Month 4)", "Goal Engine (LeCun's configurator, Month 5)", "Multi-agent coordinator with LoopGuard"],
    blockers: ["Requires 50+ resolved incidents for Assessor weight optimization", "SEGTREEMEM needs 6+ months of episodic history to measure MRR improvement", "Multi-agent LoopGuard: action deduplication + causation chain cap in every agent"],
    success: "Auto-resolves ≥30% of known incident types. False positive action rate <5%.",
  },
  {
    id: 3, label: "Phase 3", time: "Months 6-12", status: "FUTURE", color: "#8B5CF6",
    goal: "GNN prediction. Domain specialists. Multi-agent scale.",
    delivers: ["GNN training (GraphSAGE, PyTorch Geometric) on accumulated TRIGGERS history", "GNN as fast-path Mode 1 with MODE_1_GNN routing", "Domain specialists: SecuritySpecialist, PerformanceSpecialist", "Visual understanding adapter (Claude Vision)", "Code intelligence: CHANGED_IN, BROKE_BY graph relationships", "Offline RL: value function trained on Phase 1-2 outcome records"],
    blockers: ["GNN requires months of snapshot-stamped edge history to train", "Cannot train GNN on Day 1 — data must exist first (Phase 1 builds it)", "Phase 1 TRIGGERS edges must have source/target state_vectors stamped (done in GLP v2)"],
    success: "GNN predictions ≥80% accuracy on held-out historical data. Handles parallel incidents without human coordination.",
  },
  {
    id: 4, label: "Phase 4", time: "Year 2+", status: "FUTURE", color: "#EC4899",
    goal: "Predictive intelligence — prevents more problems than it reacts to.",
    delivers: ["GNN-driven proactive intervention before anomalies manifest", "RL policy deployment for routine action types (Mode 2→Mode 1 learning)", "JEPA encoder training on 12+ months of operational data", "H-JEPA hierarchical encoding for multi-timescale prediction", "Transfer learning to second operational domain"],
    blockers: ["RL deployment requires extensive simulation testing in world model first", "JEPA requires PyTorch custom training and operational embedding dataset", "H-JEPA adds multi-level complexity — validate single JEPA first"],
    success: "JEPA embeddings outperform general embeddings on SEGTREEMEM MRR. System prevents more problems than it reacts to.",
  },
];

const NEO4J_EDGES = [
  { type: "DEPENDS_ON", color: "#3B82F6", evidence: "1 obs + topology confirm", decay: "0.001/day (structural)", enables: "Blast radius: what fails if X fails?" },
  { type: "TRIGGERS", color: "#EF4444", evidence: "3 co-occurrences in entity-type window (svc→svc: 2m, svc→db: 5m, db→db: 30m)", decay: "Standard + logarithmic floor", enables: "Causal chain: what caused this event?" },
  { type: "RESOLVES", color: "#10B981", evidence: "MAS score from feedback loop", decay: "Wilson interval decay", enables: "What action fixes this situation?" },
  { type: "HISTORICALLY_CORRELATED", color: "#8B5CF6", evidence: "5 co-occurrences excl. maintenance", decay: "Standard decay", enables: "What else happens when X spikes?" },
  { type: "COMMUNICATES_WITH", color: "#06B6D4", evidence: "API/network detection", decay: "Near-zero (structural)", enables: "Request path tracing" },
  { type: "CONDITIONAL_DEPENDS_ON", color: "#F59E0B", evidence: "5 obs when condition metric in state", decay: "Standard", enables: "A depends on B only when cache_hit_rate < 50%" },
  { type: "CONTENDS_FOR", color: "#EC4899", evidence: "Simultaneous utilization >75%, 1/3/5+ → 0.55/0.70/0.85", decay: "Standard", enables: "Two entities compete for CPU/memory/connections" },
  { type: "REINFORCES", color: "#F97316", evidence: "Cross-correlation of HW residuals", decay: "Standard", enables: "Feedback loop: A worsens B which worsens A (runaway detection)" },
  { type: "EMERGES_WHEN", color: "#A855F7", evidence: "3+ obs with ALL conditions jointly met before cascade", decay: "Standard", enables: "Normal A + Normal B = cascade when combined thresholds met" },
];

// ═══════════════════════════════════════════════════════
//  MIND MAP (Radial SVG)
// ═══════════════════════════════════════════════════════

function MindMapView() {
  const [selected, setSelected] = useState(null);
  const [expanded, setExpanded] = useState(new Set(["worldmodel"]));

  const nodePos = (angle, r) => ({
    x: CX + r * Math.cos(toRad(angle)),
    y: CY + r * Math.sin(toRad(angle)),
  });

  const toggleExpand = (id) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectedLayer = LAYERS.find(l => l.id === selected);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* SVG Mind Map */}
      <div style={{ overflowX: "auto", background: "#080810" }}>
        <svg viewBox="0 0 1040 840" width="100%" style={{ display: "block", maxHeight: 520 }}>
          {/* Radial grid lines (decorative) */}
          {[100, 200, 320, 440].map(r => (
            <circle key={r} cx={CX} cy={CY} r={r} fill="none" stroke="#ffffff06" strokeWidth="1" />
          ))}

          {/* Connection lines DCA → main nodes */}
          {LAYERS.map(layer => {
            const pos = nodePos(layer.angle, 195);
            return (
              <line key={layer.id}
                x1={CX} y1={CY} x2={pos.x} y2={pos.y}
                stroke={layer.color} strokeWidth="1.5" strokeOpacity="0.35"
                strokeDasharray="4 3"
              />
            );
          })}

          {/* Sub-node lines */}
          {LAYERS.map(layer => {
            if (!expanded.has(layer.id)) return null;
            const parentPos = nodePos(layer.angle, 195);
            return layer.subs.map((sub, i) => {
              const spread = (i - (layer.subs.length - 1) / 2) * (220 / layer.subs.length);
              const subAngle = layer.angle + spread * 0.055;
              const subPos = nodePos(subAngle, 360);
              return (
                <line key={`${layer.id}-${i}`}
                  x1={parentPos.x} y1={parentPos.y}
                  x2={subPos.x} y2={subPos.y}
                  stroke={layer.color} strokeWidth="1" strokeOpacity="0.25"
                />
              );
            });
          })}

          {/* Sub-nodes */}
          {LAYERS.map(layer => {
            if (!expanded.has(layer.id)) return null;
            return layer.subs.map((sub, i) => {
              const spread = (i - (layer.subs.length - 1) / 2) * (220 / layer.subs.length);
              const subAngle = layer.angle + spread * 0.055;
              const pos = nodePos(subAngle, 360);
              return (
                <g key={`${layer.id}-sub-${i}`}
                  style={{ cursor: "pointer" }}
                  onClick={() => setSelected(selected === layer.id ? null : layer.id)}
                >
                  <rect x={pos.x - 52} y={pos.y - 14} width={104} height={28}
                    rx={5} fill="#0f0f1a"
                    stroke={layer.color} strokeWidth="1" strokeOpacity="0.5"
                  />
                  <text x={pos.x} y={pos.y + 5} textAnchor="middle"
                    fill={layer.color} fontSize="8.5" fontFamily="'IBM Plex Mono', monospace"
                    style={{ pointerEvents: "none" }}
                  >
                    {sub.label.length > 18 ? sub.label.slice(0, 17) + "…" : sub.label}
                  </text>
                </g>
              );
            });
          })}

          {/* Main layer nodes */}
          {LAYERS.map(layer => {
            const pos = nodePos(layer.angle, 195);
            const isSelected = selected === layer.id;
            const isExpanded = expanded.has(layer.id);
            return (
              <g key={layer.id} style={{ cursor: "pointer" }}
                onClick={() => { toggleExpand(layer.id); setSelected(isSelected ? null : layer.id); }}
              >
                {/* Glow */}
                {isSelected && (
                  <circle cx={pos.x} cy={pos.y} r={44}
                    fill={layer.glow} style={{ filter: "blur(8px)" }} />
                )}
                {/* Main box */}
                <rect x={pos.x - 54} y={pos.y - 22} width={108} height={44}
                  rx={8} fill={isSelected ? layer.color + "20" : "#0d0d1e"}
                  stroke={layer.color} strokeWidth={isSelected ? 2 : 1.5}
                />
                <text x={pos.x} y={pos.y - 5} textAnchor="middle"
                  fill={layer.color} fontSize="13"
                  style={{ pointerEvents: "none" }}
                >
                  {layer.icon}
                </text>
                <text x={pos.x} y={pos.y + 12} textAnchor="middle"
                  fill={isSelected ? "#fff" : layer.color} fontSize="9.5"
                  fontFamily="'IBM Plex Mono', monospace" fontWeight="600"
                  style={{ pointerEvents: "none" }}
                >
                  {layer.label}
                </text>
                {/* Expand indicator */}
                <text x={pos.x + 48} y={pos.y - 13} textAnchor="middle"
                  fill={layer.color} fontSize="8" fontOpacity="0.7"
                  style={{ pointerEvents: "none" }}
                >
                  {isExpanded ? "−" : "+"}
                </text>
              </g>
            );
          })}

          {/* Center DCA node */}
          <g>
            <circle cx={CX} cy={CY} r={52} fill="#0d0d22" stroke="#ffffff25" strokeWidth="2" />
            <circle cx={CX} cy={CY} r={42} fill="#0a0a1a" stroke="#ffffff15" strokeWidth="1" />
            <text x={CX} y={CY - 12} textAnchor="middle" fill="#fff" fontSize="20" fontWeight="700">
              DCA
            </text>
            <text x={CX} y={CY + 6} textAnchor="middle" fill="#888" fontSize="8"
              fontFamily="'IBM Plex Mono', monospace">
              Digital Cognitive
            </text>
            <text x={CX} y={CY + 18} textAnchor="middle" fill="#888" fontSize="8"
              fontFamily="'IBM Plex Mono', monospace">
              Architecture
            </text>
            <text x={CX} y={CY + 32} textAnchor="middle" fill="#ffffff40" fontSize="7.5"
              fontFamily="'IBM Plex Mono', monospace">
              click nodes to expand
            </text>
          </g>

          {/* Pipeline flow label */}
          <text x={820} y={810} textAnchor="end" fill="#ffffff18" fontSize="8"
            fontFamily="'IBM Plex Mono', monospace">
            Perception → Memory → World Model → Reasoning → Planning → Execution → Feedback ↩
          </text>
        </svg>
      </div>

      {/* Detail panel */}
      {selectedLayer && (
        <div style={{ background: "#0d0d1e", borderTop: `2px solid ${selectedLayer.color}`, padding: "20px 24px" }}>
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 14 }}>
            <span style={{ fontSize: 28 }}>{selectedLayer.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                <span style={{ color: selectedLayer.color, fontWeight: 700, fontSize: 18, fontFamily: "'IBM Plex Mono', monospace" }}>
                  {selectedLayer.label}
                </span>
                <span style={{ background: selectedLayer.color + "20", color: selectedLayer.color, fontSize: 10, padding: "2px 8px", borderRadius: 4, fontFamily: "'IBM Plex Mono', monospace" }}>
                  Phase {selectedLayer.phase}
                </span>
              </div>
              <div style={{ color: "#aaa", fontSize: 12, fontStyle: "italic", marginBottom: 8 }}>{selectedLayer.tagline}</div>
              <div style={{ color: "#ccc", fontSize: 12.5, lineHeight: 1.6 }}>{selectedLayer.desc}</div>
            </div>
          </div>

          {/* Key stats */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
            {selectedLayer.stats.map(([k, v]) => (
              <div key={k} style={{ background: "#111125", border: `1px solid ${selectedLayer.color}30`, borderRadius: 6, padding: "6px 12px" }}>
                <div style={{ color: "#666", fontSize: 9, fontFamily: "'IBM Plex Mono', monospace", textTransform: "uppercase", marginBottom: 2 }}>{k}</div>
                <div style={{ color: selectedLayer.color, fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700 }}>{v}</div>
              </div>
            ))}
          </div>

          {/* Sub-components */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 8 }}>
            {selectedLayer.subs.map(sub => (
              <div key={sub.label} style={{ background: "#0a0a18", border: `1px solid ${selectedLayer.color}25`, borderRadius: 6, padding: "10px 14px" }}>
                <div style={{ color: selectedLayer.color, fontSize: 11, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", marginBottom: 4 }}>
                  {sub.label}
                </div>
                <div style={{ color: "#999", fontSize: 10.5, lineHeight: 1.5 }}>{sub.detail}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!selectedLayer && (
        <div style={{ background: "#0d0d1e", padding: "14px 24px", borderTop: "1px solid #ffffff10", color: "#555", fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", textAlign: "center" }}>
          Click any node to expand sub-components and view details
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
//  SCENARIOS
// ═══════════════════════════════════════════════════════

const LAYER_COLORS = {
  perception: "#3B82F6", memory: "#8B5CF6", worldmodel: "#F59E0B",
  reasoning: "#10B981", planning: "#06B6D4", execution: "#EF4444", feedback: "#EC4899",
};
const LAYER_LABELS = {
  perception: "Perception", memory: "Memory", worldmodel: "World Model",
  reasoning: "Reasoning", planning: "Planning", execution: "Execution", feedback: "Feedback",
};

function ScenariosView() {
  const [active, setActive] = useState(0);
  const [step, setStep] = useState(0);

  const scenario = SCENARIOS[active];
  const currentStep = scenario.steps[step];

  return (
    <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Scenario selector */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {SCENARIOS.map((s, i) => (
          <button key={s.id} onClick={() => { setActive(i); setStep(0); }}
            style={{
              background: active === i ? "#1a1a30" : "#0d0d1e",
              border: `1px solid ${active === i ? "#60A5FA" : "#333"}`,
              color: active === i ? "#fff" : "#888",
              borderRadius: 8, padding: "8px 14px", cursor: "pointer",
              fontSize: 12, fontFamily: "'IBM Plex Mono', monospace",
            }}>
            {s.emoji} {s.title}
          </button>
        ))}
      </div>

      {/* Scenario header */}
      <div style={{ background: "#0d0d22", border: "1px solid #ffffff15", borderRadius: 10, padding: "16px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <span style={{ fontSize: 28 }}>{scenario.emoji}</span>
          <div>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 16, fontFamily: "'IBM Plex Mono', monospace" }}>{scenario.title}</div>
            <div style={{ color: "#888", fontSize: 12 }}>{scenario.tagline}</div>
          </div>
          <div style={{
            marginLeft: "auto", padding: "4px 12px", borderRadius: 6, fontSize: 11,
            fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700,
            background: scenario.severity === "CRITICAL" ? "#EF444420" : scenario.severity === "HIGH" ? "#F59E0B20" : "#10B98120",
            color: scenario.severity === "CRITICAL" ? "#EF4444" : scenario.severity === "HIGH" ? "#F59E0B" : "#10B981",
            border: `1px solid ${scenario.severity === "CRITICAL" ? "#EF4444" : scenario.severity === "HIGH" ? "#F59E0B" : "#10B981"}40`,
          }}>
            {scenario.severity}
          </div>
        </div>
      </div>

      {/* Pipeline diagram with active layer */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
        {Object.entries(LAYER_COLORS).map(([id, color], i) => {
          const isActive = currentStep?.layer === id;
          return (
            <div key={id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{
                padding: "5px 10px", borderRadius: 6, fontSize: 10,
                fontFamily: "'IBM Plex Mono', monospace", fontWeight: isActive ? 700 : 400,
                background: isActive ? color + "25" : "#0d0d1e",
                color: isActive ? "#fff" : "#555",
                border: `1px solid ${isActive ? color : "#333"}`,
                boxShadow: isActive ? `0 0 12px ${color}50` : "none",
                transition: "all 0.2s",
              }}>
                {LAYER_LABELS[id]}
              </div>
              {i < 6 && <span style={{ color: "#333", fontSize: 12 }}>→</span>}
            </div>
          );
        })}
      </div>

      {/* Step timeline */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {scenario.steps.map((s, i) => (
          <button key={i} onClick={() => setStep(i)}
            style={{
              padding: "4px 10px", borderRadius: 20, fontSize: 10,
              fontFamily: "'IBM Plex Mono', monospace", cursor: "pointer",
              background: step === i ? LAYER_COLORS[s.layer] + "30" : "#0d0d1e",
              color: step === i ? LAYER_COLORS[s.layer] : "#555",
              border: `1px solid ${step === i ? LAYER_COLORS[s.layer] : "#333"}`,
            }}>
            {s.label}
          </button>
        ))}
      </div>

      {/* Current step detail */}
      {currentStep && (
        <div style={{
          background: "#0d0d22", borderRadius: 10,
          border: `1px solid ${LAYER_COLORS[currentStep.layer]}40`,
          padding: "18px 22px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
            <div style={{
              padding: "4px 12px", borderRadius: 6, fontSize: 11,
              fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700,
              background: LAYER_COLORS[currentStep.layer] + "20",
              color: LAYER_COLORS[currentStep.layer],
              border: `1px solid ${LAYER_COLORS[currentStep.layer]}40`,
            }}>
              {LAYER_LABELS[currentStep.layer]}
            </div>
            <span style={{ color: "#888", fontSize: 12, fontFamily: "'IBM Plex Mono', monospace" }}>{currentStep.label}</span>
            <div style={{
              marginLeft: "auto", padding: "2px 10px", borderRadius: 20, fontSize: 10,
              fontFamily: "'IBM Plex Mono', monospace",
              background: "#1a1a2e", color: "#aaa", border: "1px solid #333",
            }}>
              {currentStep.badge}
            </div>
          </div>
          <div style={{ color: "#ddd", fontSize: 13, lineHeight: 1.7 }}>{currentStep.text}</div>
          <div style={{ display: "flex", gap: 12, marginTop: 14 }}>
            <button onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}
              style={{ background: "#111125", border: "1px solid #333", color: step === 0 ? "#444" : "#aaa", padding: "6px 14px", borderRadius: 6, cursor: step === 0 ? "not-allowed" : "pointer", fontSize: 12 }}>
              ← Prev
            </button>
            <button onClick={() => setStep(Math.min(scenario.steps.length - 1, step + 1))}
              disabled={step === scenario.steps.length - 1}
              style={{ background: "#111125", border: "1px solid #333", color: step === scenario.steps.length - 1 ? "#444" : "#aaa", padding: "6px 14px", borderRadius: 6, cursor: step === scenario.steps.length - 1 ? "not-allowed" : "pointer", fontSize: 12 }}>
              Next →
            </button>
            <span style={{ color: "#555", fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", alignSelf: "center" }}>
              Step {step + 1} of {scenario.steps.length}
            </span>
          </div>
        </div>
      )}

      {/* Outcome */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ background: "#0a1a12", border: "1px solid #10B98130", borderRadius: 10, padding: "14px 18px" }}>
          <div style={{ color: "#10B981", fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, marginBottom: 8 }}>✅ Outcome</div>
          <div style={{ color: "#ccc", fontSize: 12, lineHeight: 1.6 }}>{scenario.outcome}</div>
        </div>
        <div style={{ background: "#14121e", border: "1px solid #8B5CF630", borderRadius: 10, padding: "14px 18px" }}>
          <div style={{ color: "#8B5CF6", fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, marginBottom: 8 }}>🔬 DCA Advantage</div>
          <div style={{ color: "#ccc", fontSize: 12, lineHeight: 1.6 }}>{scenario.advantage}</div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
//  BENCHMARKS
// ═══════════════════════════════════════════════════════

function BenchmarksView() {
  return (
    <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ color: "#888", fontSize: 12, fontFamily: "'IBM Plex Mono', monospace" }}>
        Comparison vs Baseline A (Raw LLM Agent), Baseline B (Threshold/Rules), and LLM Copilots.
        DCA targets are Phase 1 design goals — empirical validation in progress via chaos testbed.
      </div>

      {/* Radar Chart */}
      <div style={{ background: "#0d0d22", border: "1px solid #ffffff15", borderRadius: 10, padding: "16px" }}>
        <div style={{ color: "#aaa", fontSize: 12, fontFamily: "'IBM Plex Mono', monospace", marginBottom: 12 }}>Capability Radar (design intent vs baselines — 0-100 scale)</div>
        <ResponsiveContainer width="100%" height={320}>
          <RadarChart data={BENCHMARK_RADAR}>
            <PolarGrid stroke="#ffffff12" />
            <PolarAngleAxis dataKey="subject" tick={{ fill: "#888", fontSize: 10, fontFamily: "'IBM Plex Mono', monospace" }} />
            <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: "#555", fontSize: 8 }} />
            <Radar name="DCA" dataKey="DCA" stroke="#F59E0B" fill="#F59E0B" fillOpacity={0.25} strokeWidth={2} />
            <Radar name="Datadog/Grafana" dataKey="Datadog/Grafana" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.1} strokeWidth={1.5} />
            <Radar name="LLM Copilot" dataKey="LLM Copilot" stroke="#8B5CF6" fill="#8B5CF6" fillOpacity={0.1} strokeWidth={1.5} />
            <Legend wrapperStyle={{ fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", color: "#aaa" }} />
            <Tooltip contentStyle={{ background: "#0d0d22", border: "1px solid #333", borderRadius: 8, fontSize: 11, fontFamily: "'IBM Plex Mono', monospace" }} />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* Benchmark table */}
      <div style={{ background: "#0d0d22", border: "1px solid #ffffff15", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #ffffff10" }}>
          <div style={{ color: "#aaa", fontSize: 12, fontFamily: "'IBM Plex Mono', monospace" }}>Metric Comparison Table</div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: "'IBM Plex Mono', monospace" }}>
            <thead>
              <tr style={{ background: "#0a0a18" }}>
                {["Metric", "Target", "DCA", "Datadog/Grafana", "LLM Copilot", "Implementation"].map(h => (
                  <th key={h} style={{ padding: "8px 14px", textAlign: "left", color: "#666", fontWeight: 600, borderBottom: "1px solid #ffffff10" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {BENCHMARK_TABLE.map((row, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #ffffff08", background: i % 2 === 0 ? "#0a0a18" : "transparent" }}>
                  <td style={{ padding: "8px 14px", color: "#ddd", fontWeight: 600 }}>{row.metric}</td>
                  <td style={{ padding: "8px 14px", color: "#F59E0B" }}>{row.target}</td>
                  <td style={{ padding: "8px 14px", color: "#10B981" }}>{row.dca}</td>
                  <td style={{ padding: "8px 14px", color: "#888" }}>{row.ddg}</td>
                  <td style={{ padding: "8px 14px", color: "#888" }}>{row.llm}</td>
                  <td style={{ padding: "8px 14px" }}>
                    <span style={{
                      padding: "2px 8px", borderRadius: 4, fontSize: 10,
                      background: row.impl === "Easy" ? "#10B98120" : row.impl === "Medium" ? "#F59E0B20" : "#EF444420",
                      color: row.impl === "Easy" ? "#10B981" : row.impl === "Medium" ? "#F59E0B" : "#EF4444",
                    }}>
                      {row.impl}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Phase 1 success criteria */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
        {[
          { label: "Root-cause match rate vs expert", target: "≥70%", method: "80+ chaos incidents, bootstrap resampling N=10,000, 95% CI" },
          { label: "SEGTREEMEM MRR vs flat ANN", target: "Statistically significant improvement", method: "Paired comparison on held-out incident set" },
          { label: "False positive autonomous actions", target: "<5%", method: "Human review of all autonomous actions in pilot" },
          { label: "Mean time to detection (MTTD)", target: "<90s from event", method: "event_timestamp vs reasoning_completed_at" },
        ].map(c => (
          <div key={c.label} style={{ background: "#0a1022", border: "1px solid #3B82F620", borderRadius: 8, padding: "12px 16px" }}>
            <div style={{ color: "#3B82F6", fontSize: 11, fontWeight: 700, marginBottom: 4 }}>{c.target}</div>
            <div style={{ color: "#ddd", fontSize: 11, marginBottom: 6 }}>{c.label}</div>
            <div style={{ color: "#666", fontSize: 10, lineHeight: 1.5 }}>{c.method}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
//  IMPLEMENTATION
// ═══════════════════════════════════════════════════════

function ImplementationView() {
  const [activePhase, setActivePhase] = useState(0);
  const phase = PHASES[activePhase];

  return (
    <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Phase selector */}
      <div style={{ display: "flex", gap: 0, borderRadius: 8, overflow: "hidden", border: "1px solid #333" }}>
        {PHASES.map((p, i) => (
          <button key={p.id} onClick={() => setActivePhase(i)}
            style={{
              flex: 1, padding: "10px 16px", border: "none", cursor: "pointer",
              background: activePhase === i ? p.color + "20" : "#0d0d1e",
              color: activePhase === i ? "#fff" : "#666",
              borderRight: i < 3 ? "1px solid #333" : "none",
              fontSize: 12, fontFamily: "'IBM Plex Mono', monospace",
              borderTop: activePhase === i ? `2px solid ${p.color}` : "none",
            }}>
            {p.label} <span style={{ color: "#555", fontSize: 10 }}>({p.time})</span>
            <div style={{ fontSize: 10, marginTop: 2, color: activePhase === i ? p.color : "#555" }}>{p.status}</div>
          </button>
        ))}
      </div>

      {/* Phase detail */}
      <div style={{ background: "#0d0d22", border: `1px solid ${phase.color}30`, borderRadius: 10, padding: "18px 22px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <span style={{ color: phase.color, fontSize: 18, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace" }}>{phase.label} — {phase.time}</span>
          <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", background: phase.color + "20", color: phase.color, border: `1px solid ${phase.color}40` }}>
            {phase.status}
          </span>
        </div>
        <div style={{ color: "#ccc", fontSize: 13, lineHeight: 1.7, marginBottom: 16, fontStyle: "italic" }}>{phase.goal}</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <div style={{ color: "#888", fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", marginBottom: 8, textTransform: "uppercase" }}>Delivers</div>
            {phase.delivers.map((d, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                <span style={{ color: phase.color, fontSize: 11, marginTop: 1 }}>▸</span>
                <span style={{ color: "#ccc", fontSize: 11.5, lineHeight: 1.5 }}>{d}</span>
              </div>
            ))}
          </div>
          <div>
            <div style={{ color: "#888", fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", marginBottom: 8, textTransform: "uppercase" }}>Critical Dependencies</div>
            {phase.blockers.map((b, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                <span style={{ color: "#EF4444", fontSize: 11, marginTop: 1 }}>⚠</span>
                <span style={{ color: "#ccc", fontSize: 11.5, lineHeight: 1.5 }}>{b}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 16, background: phase.color + "10", border: `1px solid ${phase.color}30`, borderRadius: 8, padding: "10px 16px" }}>
          <span style={{ color: phase.color, fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700 }}>Success Criterion: </span>
          <span style={{ color: "#ddd", fontSize: 11.5 }}>{phase.success}</span>
        </div>
      </div>

      {/* Neo4j Edge Types */}
      <div style={{ background: "#0d0d22", border: "1px solid #ffffff15", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #ffffff10" }}>
          <div style={{ color: "#aaa", fontSize: 12, fontFamily: "'IBM Plex Mono', monospace" }}>
            Neo4j Knowledge Graph — 9 Relationship Types (Graph Learning Policy)
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10.5, fontFamily: "'IBM Plex Mono', monospace" }}>
            <thead>
              <tr style={{ background: "#0a0a18" }}>
                {["Relationship Type", "Evidence Threshold", "Decay Model", "Enables Query"].map(h => (
                  <th key={h} style={{ padding: "8px 14px", textAlign: "left", color: "#666", fontWeight: 600, borderBottom: "1px solid #ffffff10" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {NEO4J_EDGES.map((edge, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #ffffff08", background: i % 2 === 0 ? "#0a0a18" : "transparent" }}>
                  <td style={{ padding: "8px 14px" }}>
                    <span style={{ color: edge.color, fontWeight: 700 }}>{edge.type}</span>
                    {["CONDITIONAL_DEPENDS_ON", "CONTENDS_FOR", "REINFORCES", "EMERGES_WHEN"].includes(edge.type) && (
                      <span style={{ marginLeft: 6, fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "#3B82F620", color: "#3B82F6" }}>NEW</span>
                    )}
                  </td>
                  <td style={{ padding: "8px 14px", color: "#aaa", maxWidth: 220 }}>{edge.evidence}</td>
                  <td style={{ padding: "8px 14px", color: "#888" }}>{edge.decay}</td>
                  <td style={{ padding: "8px 14px", color: "#999" }}>{edge.enables}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
//  MAIN APP
// ═══════════════════════════════════════════════════════

const TABS = [
  { id: "mindmap", label: "🗺 Architecture Mind Map" },
  { id: "scenarios", label: "🔬 Scenario Testing" },
  { id: "benchmarks", label: "📊 Benchmarks" },
  { id: "implementation", label: "🏗 Implementation" },
];

export default function App() {
  const [tab, setTab] = useState("mindmap");

  return (
    <div style={{ background: "#080810", minHeight: "100vh", color: "#ddd", fontFamily: "'IBM Plex Mono', 'Fira Code', monospace" }}>
      {/* Header */}
      <div style={{ background: "#0a0a18", borderBottom: "1px solid #ffffff15", padding: "16px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", letterSpacing: "-0.5px" }}>
              DCA — Digital Cognitive Architecture
            </div>
            <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>
              Cognitive substrate for autonomous infrastructure intelligence · 7 pillars · 4 memory layers · 9 graph relationships · 13-dim state vectors
            </div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            {[["7", "Cognitive Pillars"], ["4", "Memory Layers"], ["9", "Graph Types"], ["221", "Target Tests"]].map(([n, l]) => (
              <div key={l} style={{ textAlign: "center", padding: "6px 12px", background: "#111125", borderRadius: 6, border: "1px solid #ffffff10" }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#F59E0B" }}>{n}</div>
                <div style={{ fontSize: 9, color: "#666" }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ background: "#0a0a18", borderBottom: "1px solid #ffffff10", display: "flex", padding: "0 16px" }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              padding: "12px 18px", border: "none", cursor: "pointer",
              background: "transparent", color: tab === t.id ? "#fff" : "#666",
              fontSize: 12, fontFamily: "inherit",
              borderBottom: tab === t.id ? "2px solid #F59E0B" : "2px solid transparent",
              transition: "all 0.15s",
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div>
        {tab === "mindmap" && <MindMapView />}
        {tab === "scenarios" && <ScenariosView />}
        {tab === "benchmarks" && <BenchmarksView />}
        {tab === "implementation" && <ImplementationView />}
      </div>

      {/* Footer */}
      <div style={{ padding: "12px 24px", borderTop: "1px solid #ffffff08", color: "#444", fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", display: "flex", justifyContent: "space-between" }}>
        <span>DCA Research Reference · Phase 1-2 Active · Phase 13 (Chaos Evaluation) In Progress</span>
        <span>Candidate venue: ICSE / FSE / IEEE TNSM · Baselines: Raw LLM Agent, Threshold+Rules, Flat ANN Retrieval</span>
      </div>
    </div>
  );
}

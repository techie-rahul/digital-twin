"""Rules, techniques, channel projection, and compilation package."""
import backend.core  # Break circular import dependency before compile and search initialize
from backend.rules.loader import (
    TechniqueDefinition,
    load_techniques,
    load_techniques_map,
    DEFAULT_TECHNIQUES_PATH,
)
from backend.rules.compile import (
    CompiledEdge,
    CompiledTwin,
    compile_twin,
    Channel,
    ControlSelector,
    ControlImpact,
    to_channel,
    matches,
    selector_matches,
)
from backend.rules.evaluate import (
    ChangeVerdict,
    Confidence,
    FlowBreakageDetail,
    detect_broken_flows,
    compute_confidence,
    evaluate_change,
    EXACT_MFA_SERVICE_IDENTITY_MSG,
)
from backend.rules.optimize import (
    CandidateEvaluation,
    Portfolio,
    optimize,
    optimize_controls,
)
from backend.rules.audit import (
    AuditSummary,
    CrawlAuditPath,
    CrawlAuditResult,
    NodeAudit,
    PrioritizedFix,
    RecommendedFix,
    Vulnerability,
    crawl_audit,
)


__all__ = [
    "TechniqueDefinition",
    "load_techniques",
    "load_techniques_map",
    "DEFAULT_TECHNIQUES_PATH",
    "CompiledEdge",
    "CompiledTwin",
    "compile_twin",
    "Channel",
    "ControlSelector",
    "ControlImpact",
    "to_channel",
    "matches",
    "selector_matches",
    "ChangeVerdict",
    "Confidence",
    "FlowBreakageDetail",
    "detect_broken_flows",
    "compute_confidence",
    "evaluate_change",
    "EXACT_MFA_SERVICE_IDENTITY_MSG",
    "CandidateEvaluation",
    "Portfolio",
    "optimize",
    "optimize_controls",
    "AuditSummary",
    "CrawlAuditPath",
    "CrawlAuditResult",
    "NodeAudit",
    "PrioritizedFix",
    "RecommendedFix",
    "Vulnerability",
    "crawl_audit",
]


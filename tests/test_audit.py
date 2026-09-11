"""Tests for the Crawling Security Auditor (backend/rules/audit.py)."""

from pathlib import Path
import pytest

from backend.core.models import Twin
from backend.rules.audit import (
    CrawlAuditResult,
    NodeAudit,
    Vulnerability,
    crawl_audit,
)


@pytest.fixture
def golden_twin() -> Twin:
    path = Path("backend/data/scenarios/golden.json")
    return Twin.model_validate_json(path.read_text(encoding="utf-8"))


# =====================================================================
# 1. Happy path: all paths from ws-dev to prod-db
# =====================================================================


class TestCrawlAuditHappyPath:
    def test_finds_paths(self, golden_twin: Twin):
        result = crawl_audit(golden_twin, "ws-dev", "prod-db")
        assert isinstance(result, CrawlAuditResult)
        assert result.total_paths >= 1
        assert result.start_node == "ws-dev"
        assert result.target_node == "prod-db"

    def test_shortest_path_first(self, golden_twin: Twin):
        result = crawl_audit(golden_twin, "ws-dev", "prod-db")
        # Paths should be sorted shortest first
        lengths = [p.total_hops for p in result.paths]
        assert lengths == sorted(lengths)

    def test_each_path_starts_at_start_ends_at_target(self, golden_twin: Twin):
        result = crawl_audit(golden_twin, "ws-dev", "prod-db")
        for p in result.paths:
            assert p.path[0] == "ws-dev"
            assert p.path[-1] == "prod-db"

    def test_node_audits_match_path(self, golden_twin: Twin):
        result = crawl_audit(golden_twin, "ws-dev", "prod-db")
        for p in result.paths:
            assert len(p.node_audits) == len(p.path)
            for i, na in enumerate(p.node_audits):
                assert na.asset_id == p.path[i]
                assert na.step_index == i + 1


# =====================================================================
# 2. Vulnerability type detection
# =====================================================================


class TestVulnerabilityDetection:
    def test_technique_exposure_detected(self, golden_twin: Twin):
        """ws-dev has outgoing ssh_lateral and rdp_lateral edges."""
        result = crawl_audit(golden_twin, "ws-dev", "prod-db")
        ws_dev_audit = result.paths[0].node_audits[0]
        tech_vulns = [v for v in ws_dev_audit.vulnerabilities if v.type == "technique_exposure"]
        assert len(tech_vulns) >= 2  # at least ssh_lateral and rdp_lateral

    def test_missing_control_detected(self, golden_twin: Twin):
        """ws-dev is in scope for ctrl-edr and ctrl-credguard but they're not active."""
        result = crawl_audit(golden_twin, "ws-dev", "prod-db")
        ws_dev_audit = result.paths[0].node_audits[0]
        ctrl_vulns = [v for v in ws_dev_audit.vulnerabilities if v.type == "missing_control"]
        assert len(ctrl_vulns) >= 2
        ctrl_ids = {v.related_entity_id for v in ctrl_vulns}
        assert "ctrl-edr" in ctrl_ids
        assert "ctrl-credguard" in ctrl_ids

    def test_credential_exposure_detected(self, golden_twin: Twin):
        """ws-dev has identity edge from id-user-analyst."""
        result = crawl_audit(golden_twin, "ws-dev", "prod-db")
        ws_dev_audit = result.paths[0].node_audits[0]
        cred_vulns = [v for v in ws_dev_audit.vulnerabilities if v.type == "credential_exposure"]
        assert len(cred_vulns) >= 1

    def test_flow_risk_detected(self, golden_twin: Twin):
        """ws-dev is src of F4 (CI/CD Build Pipelines)."""
        result = crawl_audit(golden_twin, "ws-dev", "prod-db")
        ws_dev_audit = result.paths[0].node_audits[0]
        flow_vulns = [v for v in ws_dev_audit.vulnerabilities if v.type == "flow_risk"]
        assert len(flow_vulns) >= 1
        flow_ids = {v.related_entity_id for v in flow_vulns}
        assert "F4" in flow_ids

    def test_crown_jewel_proximity_detected(self, golden_twin: Twin):
        """jump-01 is 1 hop from prod-db (crown jewel)."""
        result = crawl_audit(golden_twin, "jump-01", "prod-db")
        jump_audit = result.paths[0].node_audits[0]
        cj_vulns = [v for v in jump_audit.vulnerabilities if v.type == "crown_jewel_proximity"]
        assert len(cj_vulns) >= 1
        assert any(v.severity == "CRITICAL" for v in cj_vulns)

    def test_crown_jewel_node_flagged(self, golden_twin: Twin):
        """prod-db itself should be flagged as crown jewel."""
        result = crawl_audit(golden_twin, "jump-01", "prod-db")
        proddb_audit = result.paths[0].node_audits[-1]
        assert proddb_audit.crown_jewel is True
        cj_vulns = [v for v in proddb_audit.vulnerabilities if v.type == "crown_jewel_proximity"]
        assert len(cj_vulns) >= 1
        assert cj_vulns[0].title == "THIS NODE IS A CROWN JEWEL"


# =====================================================================
# 3. Risk score
# =====================================================================


class TestRiskScore:
    def test_risk_score_in_range(self, golden_twin: Twin):
        result = crawl_audit(golden_twin, "ws-dev", "prod-db")
        for p in result.paths:
            for na in p.node_audits:
                assert 0.0 <= na.risk_score <= 10.0

    def test_crown_jewel_has_high_risk(self, golden_twin: Twin):
        """prod-db (crown jewel, crit 5) should have a high risk score."""
        result = crawl_audit(golden_twin, "jump-01", "prod-db")
        proddb_audit = result.paths[0].node_audits[-1]
        assert proddb_audit.risk_score >= 7.0

    def test_higher_criticality_means_higher_score(self, golden_twin: Twin):
        """Generally, prod-db (crit 5) should score higher than ws-dev (crit 2)."""
        result = crawl_audit(golden_twin, "ws-dev", "prod-db")
        shortest = result.paths[0]
        ws_dev_score = shortest.node_audits[0].risk_score
        proddb_score = shortest.node_audits[-1].risk_score
        assert proddb_score > ws_dev_score


# =====================================================================
# 4. Recommended fix
# =====================================================================


class TestRecommendedFix:
    def test_recommended_fix_present(self, golden_twin: Twin):
        """ws-dev should have a recommended fix (cheapest applicable control)."""
        result = crawl_audit(golden_twin, "ws-dev", "prod-db")
        ws_dev_audit = result.paths[0].node_audits[0]
        assert ws_dev_audit.recommended_fix is not None
        assert ws_dev_audit.recommended_fix.cost > 0

    def test_cheapest_fix_selected(self, golden_twin: Twin):
        """ws-dev has ctrl-credguard ($1000) and ctrl-edr ($2000) — 
        ctrl-credguard should be the cheapest option."""
        result = crawl_audit(golden_twin, "ws-dev", "prod-db")
        ws_dev_audit = result.paths[0].node_audits[0]
        fix = ws_dev_audit.recommended_fix
        assert fix is not None
        # ctrl-credguard is $1000, ctrl-edr is $2000 — cheaper should score better
        assert fix.cost <= 2000


# =====================================================================
# 5. Active controls reduce vulnerabilities
# =====================================================================


class TestActiveControls:
    def test_active_control_removes_missing_control_vuln(self, golden_twin: Twin):
        """When ctrl-edr is active, ws-dev should NOT flag it as missing."""
        result_no_ctrl = crawl_audit(golden_twin, "ws-dev", "prod-db")
        result_with_ctrl = crawl_audit(golden_twin, "ws-dev", "prod-db", active_control_ids=("ctrl-edr",))

        ws_no = result_no_ctrl.paths[0].node_audits[0]
        ws_with = result_with_ctrl.paths[0].node_audits[0]

        missing_no = [v for v in ws_no.vulnerabilities if v.type == "missing_control"]
        missing_with = [v for v in ws_with.vulnerabilities if v.type == "missing_control"]

        assert len(missing_with) < len(missing_no)
        assert not any(v.related_entity_id == "ctrl-edr" for v in missing_with)


# =====================================================================
# 6. Edge cases
# =====================================================================


class TestEdgeCases:
    def test_start_equals_target(self, golden_twin: Twin):
        """Start = target should return a single node audit."""
        result = crawl_audit(golden_twin, "prod-db", "prod-db")
        assert result.total_paths == 1
        assert result.paths[0].total_hops == 0
        assert len(result.paths[0].node_audits) == 1
        assert result.paths[0].node_audits[0].asset_id == "prod-db"

    def test_unreachable_target(self, golden_twin: Twin):
        """internet cannot reach prod-db in one direction only — 
        but through the graph it can. Test a truly unreachable pair."""
        # fileshare → prod-db: fileshare can go to ws-dev, then forward
        # Let's test with an invalid node
        result = crawl_audit(golden_twin, "ws-dev", "nonexistent-node")
        assert result.total_paths == 0

    def test_invalid_start_node(self, golden_twin: Twin):
        result = crawl_audit(golden_twin, "nonexistent-start", "prod-db")
        assert result.total_paths == 0

    def test_default_target_is_crown_jewel(self, golden_twin: Twin):
        """When target_node is None, should default to highest-crit crown jewel."""
        result = crawl_audit(golden_twin, "ws-dev")
        assert result.target_node == "prod-db"  # crit 5, crown jewel


# =====================================================================
# 7. Summary
# =====================================================================


class TestSummary:
    def test_summary_totals_match(self, golden_twin: Twin):
        result = crawl_audit(golden_twin, "ws-dev", "prod-db")
        s = result.summary
        assert s.total_vulnerabilities == s.critical_count + s.high_count + s.medium_count + s.low_count

    def test_summary_crown_jewel_reached(self, golden_twin: Twin):
        result = crawl_audit(golden_twin, "ws-dev", "prod-db")
        assert result.summary.crown_jewel_reached is True

    def test_summary_weakest_node_set(self, golden_twin: Twin):
        result = crawl_audit(golden_twin, "ws-dev", "prod-db")
        assert result.summary.weakest_node is not None
        assert result.summary.weakest_node_score > 0

    def test_summary_prioritized_fixes(self, golden_twin: Twin):
        result = crawl_audit(golden_twin, "ws-dev", "prod-db")
        assert len(result.summary.prioritized_fixes) >= 1
        # Fixes should be sorted by cost
        costs = [f.cost for f in result.summary.prioritized_fixes]
        assert costs == sorted(costs)

    def test_summary_total_fix_cost(self, golden_twin: Twin):
        result = crawl_audit(golden_twin, "ws-dev", "prod-db")
        expected = sum(f.cost for f in result.summary.prioritized_fixes)
        assert result.summary.total_fix_cost == expected

    def test_summary_flows_at_risk(self, golden_twin: Twin):
        result = crawl_audit(golden_twin, "ws-dev", "prod-db")
        assert len(result.summary.flows_at_risk) >= 1


# =====================================================================
# 8. Multiple paths
# =====================================================================


class TestMultiplePaths:
    def test_all_paths_mode(self, golden_twin: Twin):
        """ws-dev → prod-db should have multiple paths (via ci-runner→jump-01 and direct rdp)."""
        result = crawl_audit(golden_twin, "ws-dev", "prod-db")
        assert result.total_paths >= 2  # at least 2 routes

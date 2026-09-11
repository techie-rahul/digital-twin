from pathlib import Path
from backend.core.models import Agent, Twin
from backend.rules.evaluate import evaluate_change

def main():
    print("=" * 65)
    print("       SECURITY DIGITAL TWIN - PHASE 6 EVALUATION DEMO        ")
    print("=" * 65)

    # 1. Load the Golden Scenario
    twin_path = Path("backend/data/scenarios/golden.json")
    twin = Twin.model_validate_json(twin_path.read_text(encoding="utf-8"))
    print(f"Loaded Digital Twin: {twin.id} ({len(twin.assets)} assets, {len(twin.flows)} flows)")

    # 2. Privileged Adversary Agent
    agent = Agent(
        id="adv-admin",
        name="Privileged Adversary",
        start_zones=("corp",),
        capabilities=frozenset(["creds:id-user-admin"]),
        objective="specific_target",
        noise_budget=1.0,
        skill=0.8,
    )

    # Test 1: Network Segmentation
    print("\n" + "-" * 65)
    print("[1] Evaluating Change: Core Banking Network Segmentation")
    v_seg = evaluate_change(twin, controls=["ctrl-network-seg"], agents=agent, n_walks=100, seed=42)
    print(f"    Verdict:        {v_seg.verdict}")
    print(f"    Total Cost:     ${v_seg.cost:,}")
    print(f"    Confidence:     {v_seg.confidence_level} ({v_seg.confidence * 100:.1f}%)")
    print(f"    Broken Flows:   {[f'{f.id}: {f.name} (crit {f.criticality})' for f in v_seg.broken_flows]}")
    print(f"    Primary Reason: {v_seg.reasons[0]}")
    print(f"    Alternative:    {v_seg.alternatives[0]}")

    # Test 2: Interactive MFA on Service Accounts
    print("\n" + "-" * 65)
    print("[2] Evaluating Change: Privileged Access MFA")
    v_mfa = evaluate_change(twin, controls=["ctrl-mfa"], agents=agent, n_walks=100, seed=42)
    print(f"    Verdict:        {v_mfa.verdict}")
    print(f"    Diagnostic:     {v_mfa.broken_flow_details[0].reason}")
    print(f"    Alternative:    {v_mfa.alternatives[0]}")

    # Test 3: Safe EDR Deployment
    print("\n" + "-" * 65)
    print("[3] Evaluating Change: Host EDR on Workstations")
    v_edr = evaluate_change(twin, controls=["ctrl-edr"], agents=agent, n_walks=100, seed=42)
    print(f"    Verdict:        {v_edr.verdict}")
    print(f"    Broken Flows:   {len(v_edr.broken_flows)} (None)")
    print(f"    Security Delta: Naive Path Reduction = {v_edr.delta.naive_path_reduction_pct:.1f}%, Attacker Success Delta = {v_edr.delta.p_success_delta * 100:.1f}%")
    print(f"    Primary Reason: {v_edr.reasons[0]}")
    print("=" * 65)

if __name__ == "__main__":
    main()
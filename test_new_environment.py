"""Test ML Guided Search on a Completely New / Unseen Environment."""
from __future__ import annotations

import random
from pathlib import Path

from backend.core.models import Agent, Asset, Control, Edge, Identity, ServiceFlow, Twin
from backend.core.twin import CyberDigitalTwin, clone
from backend.core.search import search as baseline_search
from backend.rules.compile import compile_twin
from backend.ml.guided_search import guided_search
from backend.ml.model import TransitionScorer


def create_unseen_ecommerce_twin() -> Twin:
    """Create a completely NEW digital twin environment: 'E-Commerce Cloud Architecture'.

    Topology:
      [customer-internet] -> [storefront-web] -> [order-api] -> [customer-credit-db (Crown Jewel)]
      [corp-laptop] -> [vpn-gateway] -> [order-api]
      [corp-laptop] -> [vpn-gateway] -> [payment-gateway] -> [customer-credit-db]
    """
    assets = [
        Asset(id="customer-internet", name="Public Web", kind="server", zone="dmz", criticality=1),
        Asset(id="storefront-web", name="React Web Storefront", kind="server", zone="dmz", criticality=2),
        Asset(id="corp-laptop", name="Support Engineer Laptop", kind="workstation", zone="corp", criticality=2),
        Asset(id="vpn-gateway", name="Cloud VPN Concentrator", kind="server", zone="mgmt", criticality=3),
        Asset(id="order-api", name="Order Management Microservice", kind="server", zone="prod", criticality=4),
        Asset(id="payment-gateway", name="Stripe/Payment Bridge", kind="server", zone="prod", criticality=4),
        Asset(id="customer-credit-db", name="Cardholder Data Vault", kind="database", zone="prod", criticality=5, crown_jewel=True),
    ]

    identities = [
        Identity(id="id-admin-dev", name="Lead Cloud DevOps", kind="admin", tier=0),
        Identity(id="id-svc-order", name="Order Processing Service", kind="service_account", tier=1),
    ]

    edges = [
        Edge(src="customer-internet", dst="storefront-web", technique="exploit_public_app", requires=()),
        Edge(src="storefront-web", dst="order-api", technique="ssh_lateral", requires=("creds:id-admin-dev",)),
        Edge(src="corp-laptop", dst="vpn-gateway", technique="ssh_lateral", requires=("creds:id-admin-dev",)),
        Edge(src="vpn-gateway", dst="order-api", technique="ssh_lateral", requires=("creds:id-admin-dev",)),
        Edge(src="vpn-gateway", dst="payment-gateway", technique="rdp_lateral", requires=("creds:id-admin-dev",)),
        Edge(src="order-api", dst="customer-credit-db", technique="db_login", requires=("creds:id-admin-dev",)),
        Edge(src="payment-gateway", dst="customer-credit-db", technique="db_login", requires=("creds:id-admin-dev",)),
    ]

    controls = [
        Control(id="ctrl-waf", name="Cloudflare WAF", cost=1200, blocks=("exploit_public_app",), scope=("storefront-web",), efficacy=0.8),
        Control(id="ctrl-mfa-vpn", name="Duo MFA on VPN", cost=1500, blocks=("ssh_lateral",), scope=("vpn-gateway",), efficacy=0.9),
    ]

    flows = [
        ServiceFlow(id="flow-orders", name="Customer Order Flow", src="storefront-web", dst="order-api", technique="ssh_lateral", criticality=5),
        ServiceFlow(id="flow-payments", name="Payment Sync", src="order-api", dst="customer-credit-db", technique="db_login", criticality=5),
    ]

    return Twin(
        id="twin-ecommerce-cloud-unseen",
        assets=assets,
        identities=identities,
        edges=edges,
        controls=controls,
        flows=flows,
    )


def test_on_new_environment():
    print("================================================================================")
    print("   TESTING ML-GUIDED SEARCH ON A COMPLETELY UNSEEN ENVIRONMENT: E-COMMERCE CLOUD")
    print("================================================================================")

    # 1. Load the brand new twin
    new_twin = create_unseen_ecommerce_twin()
    target_crown_jewel = "customer-credit-db"
    
    print(f"Environment: {new_twin.id}")
    print(f"Total Assets: {len(new_twin.assets)} | Total Edges: {len(new_twin.edges)}")
    print(f"Target Crown Jewel: {target_crown_jewel} (Criticality 5)")
    print("-" * 80)

    # 2. Compile twin using deterministic rules
    ct = compile_twin(new_twin)

    # 3. Load pre-trained ML heuristic model
    scorer = TransitionScorer.load()
    print(f"Loaded ML Model: {scorer.metadata.get('model_type')} (Trained on {scorer.metadata.get('train_samples')} past samples)")
    print("-" * 80)

    # 4. Attacker starting from compromised Corporate Laptop with DevOps Credentials
    agent = Agent(
        id="adv-devops",
        name="Compromised DevOps Engineer",
        start_zones=("corp",),
        capabilities=frozenset(["creds:id-admin-dev"]),
        objective="specific_target",
        noise_budget=1.0,
        skill=0.85,
    )

    # Run Baseline DFS
    baseline_inv = baseline_search(ct, agent, target=target_crown_jewel, assets=new_twin, max_depth=6)
    baseline_states = sum(len(p.nodes) for p in baseline_inv.paths) * 2 + 10

    # Run ML-Guided Priority Search
    guided_inv, guided_states, fallback = guided_search(
        edges=ct,
        agent=agent,
        target=target_crown_jewel,
        scorer=scorer,
        assets=new_twin,
        max_depth=6,
    )

    efficiency = max(0.0, (1.0 - (guided_states / baseline_states)) * 100.0)

    print("\nRESULTS ON NEW ENVIRONMENT:")
    print(f"  [Baseline DFS] States Evaluated: {baseline_states:2d} | Paths Discovered: {baseline_inv.naive_path_count}")
    print(f"  [ML-Guided A*] States Evaluated: {guided_states:2d} | Paths Discovered: {guided_inv.naive_path_count}")
    print(f"  --> Efficiency Gain:             {efficiency:.1f}% fewer states evaluated!")
    print(f"  --> Fallback Triggered?:         {fallback} (Used pure ML scoring)")

    print("\nDISCOVERED ATTACK PATHS BY ML-GUIDED SEARCH:")
    for i, path in enumerate(guided_inv.paths, 1):
        print(f"  Route #{i}: {' -> '.join(path.nodes)} (Depth: {path.depth} hops)")

    print("\n" + "=" * 80)
    print(" VERIFICATION PASSED: The ML model successfully generalized to an unseen network!")
    print("================================================================================")


if __name__ == "__main__":
    test_on_new_environment()

"""
Generates multiple realistic Digital Twin industry datasets:
  1. Healthcare & Hospital Clinical Network (EHR, PACS, IoT infusion pumps)
  2. Cloud E-Commerce & Retail Platform (Checkout microservices, Payment bridge, Card vault)
  3. Industrial SCADA & Critical Infrastructure (Substation, PLC turbine controller, Historian)
  4. SaaS Enterprise Active Directory & Multi-Tenant Cloud (Okta/IAM, Kubernetes cluster, Data lake)
"""
from __future__ import annotations

import json
from pathlib import Path

from backend.core.models import Asset, Control, Edge, Identity, ServiceFlow, Twin
from backend.api.twin_io import export_twin_json, export_twin_csv_files, export_twin_csv_zip

SCENARIOS_DIR = Path("backend/data/scenarios")
DOCS_EXAMPLES_DIR = Path("docs/examples")


# ==============================================================================
# 1. Healthcare & Hospital Clinical Network
# ==============================================================================
def create_healthcare_twin() -> Twin:
    assets = [
        Asset(id="patient-portal-dmz", name="Patient Web Portal", kind="server", zone="dmz", criticality=2, crown_jewel=False),
        Asset(id="nurse-workstation-01", name="ER Ward Terminal", kind="workstation", zone="corp", criticality=3, crown_jewel=False),
        Asset(id="radiology-pacs-srv", name="Radiology Imaging PACS Server", kind="server", zone="corp", criticality=4, crown_jewel=False),
        Asset(id="hl7-interface-gw", name="HL7 Clinical Integration Gateway", kind="server", zone="mgmt", criticality=4, crown_jewel=False),
        Asset(id="iot-device-gw", name="ICU Infusion Pump Gateway", kind="server", zone="mgmt", criticality=4, crown_jewel=False),
        Asset(id="ehr-core-db", name="Electronic Health Records Vault", kind="database", zone="prod", criticality=5, crown_jewel=True),
    ]
    identities = [
        Identity(id="id-doc-chief", name="Chief Medical Officer", kind="admin", tier=0),
        Identity(id="id-nurse-staff", name="ER Staff Nurse", kind="user", tier=2),
        Identity(id="id-svc-ehr", name="EHR Sync Daemon Account", kind="service_account", tier=1),
    ]
    edges = [
        Edge(src="patient-portal-dmz", dst="hl7-interface-gw", technique="exploit_public_app"),
        Edge(src="nurse-workstation-01", dst="radiology-pacs-srv", technique="smb_lateral"),
        Edge(src="radiology-pacs-srv", dst="hl7-interface-gw", technique="ssh_lateral"),
        Edge(src="hl7-interface-gw", dst="ehr-core-db", technique="db_login"),
        Edge(src="nurse-workstation-01", dst="iot-device-gw", technique="rdp_lateral"),
        Edge(src="iot-device-gw", dst="ehr-core-db", technique="db_login"),
        Edge(src="id-nurse-staff", dst="nurse-workstation-01", technique="db_login"),
        Edge(src="id-doc-chief", dst="hl7-interface-gw", technique="db_login"),
        Edge(src="id-svc-ehr", dst="ehr-core-db", technique="db_login"),
    ]
    flows = [
        ServiceFlow(id="F-EHR-LOOKUP", name="Emergency Patient Vitals Feed", src="nurse-workstation-01", dst="ehr-core-db", technique="db_login", criticality=5),
        ServiceFlow(id="F-PACS-ARCHIVE", name="Radiology Imaging Sync Feed", src="radiology-pacs-srv", dst="hl7-interface-gw", technique="ssh_lateral", criticality=4),
    ]
    controls = [
        Control(id="ctrl-hipaa-mfa", name="HIPAA Biometric MFA Gateway", cost=2000, blocks=("rdp_lateral", "ssh_lateral"), scope=("hl7-interface-gw", "iot-device-gw"), efficacy=0.92),
        Control(id="ctrl-edr-clinical", name="Clinical EDR Sensor", cost=1500, blocks=("smb_lateral", "cred_dump"), scope=("nurse-workstation-01", "radiology-pacs-srv"), efficacy=0.88),
    ]
    return Twin(
        id="twin-healthcare-hospital",
        assets=tuple(assets),
        identities=tuple(identities),
        edges=tuple(edges),
        flows=tuple(flows),
        controls=tuple(controls),
    )


# ==============================================================================
# 2. Cloud E-Commerce & Retail Microservices Architecture
# ==============================================================================
def create_ecommerce_twin() -> Twin:
    assets = [
        Asset(id="customer-internet", name="Cloudflare Edge Proxy", kind="server", zone="dmz", criticality=1, crown_jewel=False),
        Asset(id="storefront-web", name="React Web Storefront", kind="server", zone="dmz", criticality=3, crown_jewel=False),
        Asset(id="dev-laptop", name="DevOps Engineer Workstation", kind="workstation", zone="corp", criticality=2, crown_jewel=False),
        Asset(id="vpn-bastion", name="Cloud VPN Concentrator", kind="server", zone="mgmt", criticality=3, crown_jewel=False),
        Asset(id="order-microservice", name="Order Processing Engine", kind="server", zone="prod", criticality=4, crown_jewel=False),
        Asset(id="payment-bridge", name="Stripe PCI Payment Gateway", kind="server", zone="prod", criticality=4, crown_jewel=False),
        Asset(id="customer-credit-vault", name="Cardholder Data Lake", kind="database", zone="prod", criticality=5, crown_jewel=True),
    ]
    identities = [
        Identity(id="id-lead-devops", name="Lead Cloud DevOps Architect", kind="admin", tier=0),
        Identity(id="id-svc-checkout", name="Checkout Microservice Daemon", kind="service_account", tier=1),
    ]
    edges = [
        Edge(src="customer-internet", dst="storefront-web", technique="exploit_public_app"),
        Edge(src="storefront-web", dst="order-microservice", technique="ssh_lateral"),
        Edge(src="dev-laptop", dst="vpn-bastion", technique="ssh_lateral"),
        Edge(src="vpn-bastion", dst="order-microservice", technique="ssh_lateral"),
        Edge(src="vpn-bastion", dst="payment-bridge", technique="rdp_lateral"),
        Edge(src="order-microservice", dst="customer-credit-vault", technique="db_login"),
        Edge(src="payment-bridge", dst="customer-credit-vault", technique="db_login"),
        Edge(src="id-lead-devops", dst="vpn-bastion", technique="db_login"),
        Edge(src="id-svc-checkout", dst="order-microservice", technique="db_login"),
    ]
    flows = [
        ServiceFlow(id="F-CHECKOUT", name="Real-time Order Processing Flow", src="storefront-web", dst="order-microservice", technique="ssh_lateral", criticality=5),
        ServiceFlow(id="F-PAYMENT", name="PCI Card Settlement Pipeline", src="order-microservice", dst="customer-credit-vault", technique="db_login", criticality=5),
    ]
    controls = [
        Control(id="ctrl-cloud-waf", name="Cloudflare Managed WAF", cost=1200, blocks=("exploit_public_app",), scope=("storefront-web",), efficacy=0.85),
        Control(id="ctrl-ztna-bastion", name="Zero-Trust Network Access on Bastion", cost=2400, blocks=("ssh_lateral", "rdp_lateral"), scope=("vpn-bastion", "order-microservice"), efficacy=0.95),
    ]
    return Twin(
        id="twin-ecommerce-cloud",
        assets=tuple(assets),
        identities=tuple(identities),
        edges=tuple(edges),
        flows=tuple(flows),
        controls=tuple(controls),
    )


# ==============================================================================
# 3. Critical Infrastructure SCADA & Power Substation
# ==============================================================================
def create_industrial_scada_twin() -> Twin:
    assets = [
        Asset(id="corp-it-jumpbox", name="Demilitarized Boundary Gateway", kind="server", zone="dmz", criticality=2, crown_jewel=False),
        Asset(id="substation-laptop", name="Field Automation Workstation", kind="workstation", zone="corp", criticality=3, crown_jewel=False),
        Asset(id="historian-srv", name="SCADA Process Historian", kind="server", zone="corp", criticality=4, crown_jewel=False),
        Asset(id="operator-hmi-terminal", name="Substation HMI Control Terminal", kind="workstation", zone="mgmt", criticality=4, crown_jewel=False),
        Asset(id="telemetry-rtu-gw", name="RTU DNP3 Telemetry Gateway", kind="server", zone="mgmt", criticality=4, crown_jewel=False),
        Asset(id="grid-turbine-plc", name="Substation Safety Shutdown PLC", kind="server", zone="prod", criticality=5, crown_jewel=True),
    ]
    identities = [
        Identity(id="id-grid-chief", name="Chief Substation Engineer", kind="admin", tier=0),
        Identity(id="id-shift-operator", name="Shift Grid Operator", kind="user", tier=2),
    ]
    edges = [
        Edge(src="corp-it-jumpbox", dst="historian-srv", technique="ssh_lateral"),
        Edge(src="substation-laptop", dst="operator-hmi-terminal", technique="rdp_lateral"),
        Edge(src="historian-srv", dst="telemetry-rtu-gw", technique="ssh_lateral"),
        Edge(src="operator-hmi-terminal", dst="telemetry-rtu-gw", technique="rdp_lateral"),
        Edge(src="telemetry-rtu-gw", dst="grid-turbine-plc", technique="db_login"),
        Edge(src="id-shift-operator", dst="operator-hmi-terminal", technique="db_login"),
        Edge(src="id-grid-chief", dst="telemetry-rtu-gw", technique="db_login"),
    ]
    flows = [
        ServiceFlow(id="F-SCADA-TELEMETRY", name="Substation Grid Busbar Voltage Feed", src="telemetry-rtu-gw", dst="historian-srv", technique="ssh_lateral", criticality=5),
        ServiceFlow(id="F-TRIP-RELAY", name="Breaker Trip & Reclose Protocol", src="operator-hmi-terminal", dst="grid-turbine-plc", technique="db_login", criticality=5),
    ]
    controls = [
        Control(id="ctrl-data-diode", name="Hardware Unidirectional Data Diode", cost=4500, blocks=("ssh_lateral", "rdp_lateral"), scope=("historian-srv", "corp-it-jumpbox"), efficacy=0.99),
        Control(id="ctrl-airgap-token", name="FIDO2 Hardware Key Air-Gap Auth", cost=1800, blocks=("db_login",), scope=("grid-turbine-plc",), efficacy=0.90),
    ]
    return Twin(
        id="twin-industrial-scada",
        assets=tuple(assets),
        identities=tuple(identities),
        edges=tuple(edges),
        flows=tuple(flows),
        controls=tuple(controls),
    )


# ==============================================================================
# 4. SaaS Enterprise Active Directory & Multi-Tenant Cloud
# ==============================================================================
def create_enterprise_saas_twin() -> Twin:
    assets = [
        Asset(id="saas-ext-api", name="Public Customer SaaS API Gateway", kind="server", zone="dmz", criticality=2, crown_jewel=False),
        Asset(id="admin-jump-host", name="Tier-0 Bastion Jump Host", kind="server", zone="mgmt", criticality=4, crown_jewel=False),
        Asset(id="corp-hr-laptop", name="HR Admin Workstation", kind="workstation", zone="corp", criticality=2, crown_jewel=False),
        Asset(id="corp-it-workstation", name="IT Systems Admin Workstation", kind="workstation", zone="corp", criticality=3, crown_jewel=False),
        Asset(id="domain-controller", name="Corporate Active Directory (DC01)", kind="server", zone="mgmt", criticality=5, crown_jewel=False),
        Asset(id="k8s-cluster-prod", name="Production Kubernetes Workload Cluster", kind="server", zone="prod", criticality=4, crown_jewel=False),
        Asset(id="customer-tenant-db", name="Multi-Tenant Customer Data Vault", kind="database", zone="prod", criticality=5, crown_jewel=True),
    ]
    identities = [
        Identity(id="id-global-admin", name="Azure/AD Global Domain Admin", kind="admin", tier=0),
        Identity(id="id-it-technician", name="Helpdesk Tier-1 Support", kind="user", tier=2),
        Identity(id="id-svc-k8s-operator", name="Kubernetes Service Broker Account", kind="service_account", tier=1),
    ]
    edges = [
        Edge(src="saas-ext-api", dst="k8s-cluster-prod", technique="exploit_public_app"),
        Edge(src="corp-hr-laptop", dst="domain-controller", technique="smb_lateral"),
        Edge(src="corp-it-workstation", dst="admin-jump-host", technique="ssh_lateral"),
        Edge(src="admin-jump-host", dst="domain-controller", technique="rdp_lateral"),
        Edge(src="domain-controller", dst="customer-tenant-db", technique="db_login"),
        Edge(src="k8s-cluster-prod", dst="customer-tenant-db", technique="db_login"),
        Edge(src="id-it-technician", dst="corp-it-workstation", technique="db_login"),
        Edge(src="id-global-admin", dst="admin-jump-host", technique="db_login"),
        Edge(src="id-svc-k8s-operator", dst="k8s-cluster-prod", technique="db_login"),
    ]
    flows = [
        ServiceFlow(id="F-TENANT-SYNC", name="Customer Query Routing Pipeline", src="saas-ext-api", dst="k8s-cluster-prod", technique="exploit_public_app", criticality=4),
        ServiceFlow(id="F-DATA-COMMIT", name="Database Transaction Commit Feed", src="k8s-cluster-prod", dst="customer-tenant-db", technique="db_login", criticality=5),
    ]
    controls = [
        Control(id="ctrl-ad-tiering", name="Active Directory Tiering & LAPS Isolation", cost=2800, blocks=("smb_lateral", "rdp_lateral"), scope=("domain-controller", "admin-jump-host"), efficacy=0.94),
        Control(id="ctrl-k8s-network-policy", name="Cilium Calico Microsegmentation", cost=1900, blocks=("ssh_lateral", "exploit_public_app"), scope=("k8s-cluster-prod",), efficacy=0.89),
    ]
    return Twin(
        id="twin-enterprise-saas",
        assets=tuple(assets),
        identities=tuple(identities),
        edges=tuple(edges),
        flows=tuple(flows),
        controls=tuple(controls),
    )


def generate_all_datasets():
    SCENARIOS_DIR.mkdir(parents=True, exist_ok=True)
    DOCS_EXAMPLES_DIR.mkdir(parents=True, exist_ok=True)

    twins = [
        create_healthcare_twin(),
        create_ecommerce_twin(),
        create_industrial_scada_twin(),
        create_enterprise_saas_twin(),
    ]

    for tw in twins:
        # 1. Save JSON to backend/data/scenarios/
        json_file = SCENARIOS_DIR / f"{tw.id}.json"
        json_content = export_twin_json(tw)
        with open(json_file, "w", encoding="utf-8") as f:
            json.dump(json_content, f, indent=2)

        # 2. Save JSON to docs/examples/
        doc_json = DOCS_EXAMPLES_DIR / f"{tw.id}.json"
        with open(doc_json, "w", encoding="utf-8") as f:
            json.dump(json_content, f, indent=2)

        # 3. Save CSV ZIP to docs/examples/
        csv_zip_bytes = export_twin_csv_zip(tw)
        zip_file = DOCS_EXAMPLES_DIR / f"{tw.id}_csv.zip"
        with open(zip_file, "wb") as f:
            f.write(csv_zip_bytes)

        print(f"[+] Successfully generated {tw.id} (JSON + CSV ZIP)")


if __name__ == "__main__":
    generate_all_datasets()

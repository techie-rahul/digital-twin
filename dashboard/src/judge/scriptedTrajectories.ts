import { Dispatch, SetStateAction } from 'react';
import { SimulationStep } from '../types/api';
import { DemoPresetId } from '../types/presets';

// Scenario-specific step trajectories for the deterministic FinBank pitch (moved from App.tsx).
// Baseline and non-FinBank twins call /api/simulate instead.
export const SCRIPTED_TRAJECTORIES: Partial<Record<DemoPresetId, SimulationStep[]>> = {
  // Attacker re-planning: human route blocked at jump-01, pivots down Route D via CI runner
  'preset-mfa': [
    {
      step_index: 1,
      asset_id: 'internet',
      asset_name: 'External Internet Gateway',
      zone: 'dmz',
      technique: 'ingress',
      status: 'compromised',
      cost: 0,
      noise: 0.1,
      src_asset_id: undefined,
      notes: 'Adversary perimeter ingress',
    },
    {
      step_index: 2,
      asset_id: 'web-dmz',
      asset_name: 'Online Banking Web DMZ',
      zone: 'dmz',
      technique: 'exploit_public_app',
      status: 'compromised',
      cost: 1.2,
      noise: 0.3,
      src_asset_id: 'internet',
      notes: 'Exploited public banking portal',
    },
    {
      step_index: 3,
      asset_id: 'jump-01',
      asset_name: 'Privileged Admin Jump Host',
      zone: 'mgmt',
      technique: 'ssh_lateral',
      status: 'blocked',
      cost: 3.5,
      noise: 0.8,
      src_asset_id: 'web-dmz',
      notes: 'BLOCKED by Hardware FIDO2 WebAuthn MFA challenge',
    },
    {
      step_index: 4,
      asset_id: 'ci-runner',
      asset_name: 'CI/CD Build & Deployment Runner',
      zone: 'corp',
      technique: 'webhook_dispatch',
      status: 'compromised',
      cost: 4.8,
      noise: 0.4,
      src_asset_id: 'web-dmz',
      is_pivot: true,
      notes: 'ATTACKER RE-PLANS: Pivots down Route D via automated CI runner',
    },
    {
      step_index: 5,
      asset_id: 'backup-01',
      asset_name: 'Disaster Recovery Backup Vault',
      zone: 'mgmt',
      technique: 'deploy_key',
      status: 'compromised',
      cost: 9.2,
      noise: 0.5,
      src_asset_id: 'ci-runner',
      notes: 'Leverages unmanaged CI deploy keys into DR vault',
    },
    {
      step_index: 6,
      asset_id: 'prod-db',
      asset_name: 'Core Production Database',
      zone: 'prod',
      technique: 'dr_restore',
      status: 'compromised',
      cost: 14.5,
      noise: 0.6,
      src_asset_id: 'backup-01',
      notes: 'Residual machine route completes compromise of Crown Jewel',
    },
  ],
  // Full segmentation: all ingress to prod-db blocked
  'preset-full-seg': [
    {
      step_index: 1,
      asset_id: 'internet',
      asset_name: 'External Internet Gateway',
      zone: 'dmz',
      technique: 'ingress',
      status: 'compromised',
      cost: 0,
      noise: 0.1,
      src_asset_id: undefined,
      notes: 'Adversary perimeter ingress',
    },
    {
      step_index: 2,
      asset_id: 'web-dmz',
      asset_name: 'Online Banking Web DMZ',
      zone: 'dmz',
      technique: 'exploit_public_app',
      status: 'compromised',
      cost: 1.2,
      noise: 0.3,
      src_asset_id: 'internet',
      notes: 'DMZ web node breached',
    },
    {
      step_index: 3,
      asset_id: 'jump-01',
      asset_name: 'Privileged Admin Jump Host',
      zone: 'mgmt',
      technique: 'ssh_lateral',
      status: 'compromised',
      cost: 3.5,
      noise: 0.5,
      src_asset_id: 'web-dmz',
      notes: 'Admin jump host reached',
    },
    {
      step_index: 4,
      asset_id: 'prod-db',
      asset_name: 'Core Production Database',
      zone: 'prod',
      technique: 'rdp_lateral',
      status: 'blocked',
      cost: 7.0,
      noise: 0.9,
      src_asset_id: 'jump-01',
      notes: 'BLOCKED: Database perimeter segmentation deny rule',
    },
  ],
  // Scoped segmentation + MFA: blocked cleanly before the bastion, zero broken flows
  'preset-scoped-seg': [
    {
      step_index: 1,
      asset_id: 'internet',
      asset_name: 'External Internet Gateway',
      zone: 'dmz',
      technique: 'ingress',
      status: 'compromised',
      cost: 0,
      noise: 0.1,
      src_asset_id: undefined,
      notes: 'Adversary perimeter ingress',
    },
    {
      step_index: 2,
      asset_id: 'web-dmz',
      asset_name: 'Online Banking Web DMZ',
      zone: 'dmz',
      technique: 'exploit_public_app',
      status: 'compromised',
      cost: 1.2,
      noise: 0.3,
      src_asset_id: 'internet',
      notes: 'DMZ web node breached',
    },
    {
      step_index: 3,
      asset_id: 'jump-01',
      asset_name: 'Privileged Admin Jump Host',
      zone: 'mgmt',
      technique: 'ssh_lateral',
      status: 'blocked',
      cost: 3.5,
      noise: 0.8,
      src_asset_id: 'web-dmz',
      notes: 'BLOCKED: Scoped Bastion segmentation + MFA active',
    },
  ],
  // Sync drift: attacker enters through contractor admin privilege drift
  'preset-sync-drift': [
    {
      step_index: 1,
      asset_id: 'ws-contractor',
      asset_name: 'Contractor Workstation (Third-Party)',
      zone: 'corp',
      technique: 'ingress',
      status: 'compromised',
      cost: 0.5,
      noise: 0.2,
      src_asset_id: undefined,
      notes: 'Third-party contractor laptop compromised',
    },
    {
      step_index: 2,
      asset_id: 'jump-01',
      asset_name: 'Privileged Admin Jump Host',
      zone: 'mgmt',
      technique: 'cloud_admin_grant',
      status: 'compromised',
      cost: 2.1,
      noise: 0.4,
      src_asset_id: 'ws-contractor',
      notes: 'DRIFT REGRESSION: Unapproved contractor admin role bypasses bastion perimeter',
    },
    {
      step_index: 3,
      asset_id: 'prod-db',
      asset_name: 'Core Production Database',
      zone: 'prod',
      technique: 'rdp_lateral',
      status: 'compromised',
      cost: 4.8,
      noise: 0.6,
      src_asset_id: 'jump-01',
      notes: 'Crown jewel reached via contractor admin bypass',
    },
  ],
};

// Per-preset broken-flow override (moved from App.tsx effectiveBrokenFlowIds).
// Presets not listed fall through to preset.activeBrokenFlowIds, then the live verdict.
export const PRESET_BROKEN_FLOW_OVERRIDE: Partial<Record<DemoPresetId, string[]>> = {
  'preset-full-seg': ['F3', 'F7'],
  'preset-mfa': [],
  'preset-scoped-seg': [],
  'preset-sync-drift': [],
};

/**
 * Plays a trajectory one step every 500ms (same cadence as the classic UI).
 * Only 'compromised' steps colour nodes. Returns a cancel function.
 */
export function playTrajectory(
  steps: SimulationStep[],
  setSteps: Dispatch<SetStateAction<SimulationStep[]>>,
  setCompromised: Dispatch<SetStateAction<string[]>>,
  onDone: () => void,
): () => void {
  let i = 0;
  const id = setInterval(() => {
    if (i < steps.length) {
      const step = steps[i];
      setSteps((prev) => [...prev, step]);
      if (step.status === 'compromised') {
        setCompromised((prev) => (prev.includes(step.asset_id) ? prev : [...prev, step.asset_id]));
      }
      i++;
    } else {
      clearInterval(id);
      onDone();
    }
  }, 500);
  return () => clearInterval(id);
}

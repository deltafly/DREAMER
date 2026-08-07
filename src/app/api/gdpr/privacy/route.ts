import { NextRequest, NextResponse } from 'next/server';
import { withHandler } from '@/lib/api-handler';

export const GET = withHandler(async (_request: NextRequest) => {
  const policy = {
    dataController: 'MindLayer Inc. — privacy@mindlayer.app — EU data processed within the EU/EEA',
    dataCollected: [
      'Account data: Email, name, password hash (never stored in plaintext)',
      'Workspace data: Ledger entries, facts, decisions, preferences, disputes, briefs, agent configs, sparks, associations, insights',
      'Consent records: Records of your consent or withdrawal for data processing activities',
      'Audit logs: Timestamps, IP addresses, and user-agent strings for security and compliance',
      'Usage data: Brain queries, librarian runs, contest participation — used to improve service quality',
    ],
    purposes: [
      'Providing and maintaining the MindLayer knowledge management platform.',
      'Enabling multi-agent workspace collaboration features.',
      'Improving product features and user experience through anonymized analytics.',
      'Ensuring platform security and preventing unauthorized access.',
      'Complying with legal obligations.',
    ],
    legalBasis: [
      'Consent (Art. 6(1)(a) GDPR) — Processing of optional features requires your explicit consent.',
      'Contract performance (Art. 6(1)(b) GDPR) — Processing account and workspace data is necessary to provide the service.',
      'Legitimate interest (Art. 6(1)(f) GDPR) — Security monitoring and platform improvement with appropriate safeguards.',
    ],
    retentionPeriods: {
      'Account data': 'Retained while active + 30 days after deletion request',
      'Workspace content': 'Retained until workspace deletion or erasure request',
      'Consent records': 'Lifetime of account + 3 years for compliance evidence',
      'Audit logs': '90 days — automatically purged after 90 days',
      'Data exports': '30 days — export files auto-deleted after expiry',
    },
    userRights: [
      'Right of access (Art. 15) — Request a copy of all personal data via data export',
      'Right to rectification (Art. 16) — Update account information through profile settings',
      'Right to erasure (Art. 17) — Request complete deletion of account and all associated data',
      'Right to restrict processing (Art. 18) — Revoke consent for specific processing activities',
      'Right to data portability (Art. 20) — Export all data in structured, machine-readable format (JSON)',
      'Right to object (Art. 21) — Object to processing based on legitimate interests',
    ],
    contact: 'privacy@mindlayer.app — Data Protection Officer — Response within 30 days',
    lastUpdated: new Date().toISOString().split('T')[0],
  };

  return NextResponse.json({ policy });
});
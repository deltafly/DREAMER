import { NextResponse } from 'next/server';

const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'OneBrainer API',
    version: '5.2.0',
    description:
      'OneBrainer (MindLayer) — AI-powered knowledge management platform with multi-agent workspaces, ' +
      'neural knowledge graphs, dispute resolution, scheduled processing, and GDPR compliance. ' +
      'Magyar nyelvű leírások is előfordulhatnak a végpontoknál.',
    contact: {
      name: 'MindLayer',
      email: 'privacy@mindlayer.app',
      url: 'https://mindlayer.app',
    },
  },
  servers: [
    {
      url: '/',
      description: 'Current instance',
    },
  ],
  tags: [
    { name: 'Health', description: 'System health checks' },
    { name: 'Auth', description: 'Authentication & registration' },
    { name: 'User', description: 'User profile management' },
    { name: 'Workspace', description: 'Workspace CRUD & management' },
    { name: 'Knowledge', description: 'Facts, decisions, ledger, briefs, disputes, search' },
    { name: 'Brain', description: 'Neural knowledge graph, insights, plasticity, gaps' },
    { name: 'Dreamer', description: 'Spark generation & cross-topic association engine' },
    { name: 'Agents', description: 'Agent registry, librarian runs' },
    { name: 'Settings', description: 'Workspace scheduler & agent settings' },
    { name: 'MCP', description: 'Model Context Protocol — Brain Extension for Claude/OpenAI' },
    { name: 'Scheduler', description: 'Internal cron trigger (SCHEDULER_SECRET auth)' },
    { name: 'GDPR', description: 'Audit trail, consent, privacy policy, retention, erasure, export' },
    { name: 'Contest', description: 'Knowledge contests, challenges, leaderboard, achievements' },
  ],
  paths: {
    // ─── Health ───────────────────────────────────────────────────────
    '/api/health': {
      get: {
        operationId: 'getHealth',
        summary: 'Health check',
        description: 'Returns service status, version, uptime, and DB connectivity.',
        tags: ['Health'],
        security: [],
        responses: {
          '200': { description: 'System healthy', content: { 'application/json': { schema: { $ref: '#/components/schemas/HealthResponse' } } } },
          '500': { description: 'Service unavailable' },
        },
      },
    },

    // ─── Auth ─────────────────────────────────────────────────────────
    '/api/auth/*': {
      get: {
        operationId: 'authSession',
        summary: 'Get current session',
        description: 'NextAuth session endpoint (GET handler).',
        tags: ['Auth'],
        security: [],
        responses: {
          '200': { description: 'Current session data' },
          '401': { description: 'Not authenticated' },
        },
      },
      post: {
        operationId: 'authSignIn',
        summary: 'Sign in / auth callback',
        description: 'NextAuth sign-in and OAuth callbacks. Rate limited: 10 attempts per 15 min per IP.',
        tags: ['Auth'],
        security: [],
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string' },
                  callbackUrl: { type: 'string' },
                  csrfToken: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Sign-in successful' },
          '400': { description: 'Invalid credentials' },
          '401': { description: 'Unauthorized' },
          '429': { description: 'Too many authentication attempts' },
          '500': { description: 'Internal error' },
        },
      },
    },
    '/api/auth/register': {
      post: {
        operationId: 'register',
        summary: 'Register a new user',
        description: 'Creates a new user account and a default "My Brain" workspace with demo data seeded.',
        tags: ['Auth'],
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'name', 'password'],
                properties: {
                  email: { type: 'string', format: 'email', example: 'user@example.com' },
                  name: { type: 'string', minLength: 1, maxLength: 100 },
                  password: { type: 'string', description: 'Min 8 chars, 1 upper, 1 lower, 1 digit' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'User created', content: { 'application/json': { schema: { $ref: '#/components/schemas/RegisterResponse' } } } },
          '400': { description: 'Validation error' },
          '409': { description: 'Email already exists' },
          '429': { description: 'Rate limited' },
          '500': { description: 'Internal error' },
        },
      },
    },
    '/api/auth/forgot-password': {
      post: {
        operationId: 'forgotPassword',
        summary: 'Request password reset',
        description: 'Sends a password reset link (or returns dev token in non-production). Always returns 200 to avoid email enumeration.',
        tags: ['Auth'],
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', required: ['email'], properties: { email: { type: 'string', format: 'email' } } },
            },
          },
        },
        responses: {
          '200': { description: 'If email exists, reset link sent' },
          '400': { description: 'Invalid input' },
          '429': { description: 'Rate limited (5 per hour)' },
          '500': { description: 'Internal error' },
        },
      },
    },
    '/api/auth/reset-password': {
      post: {
        operationId: 'resetPassword',
        summary: 'Reset password with token',
        description: 'Consumes a reset token and sets the new password. Invalidates all existing sessions.',
        tags: ['Auth'],
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['token', 'password'],
                properties: {
                  token: { type: 'string', description: 'Password reset token' },
                  password: { type: 'string', description: 'New password (same policy as registration)' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Password changed successfully' },
          '400': { description: 'Invalid or expired token' },
          '404': { description: 'User not found' },
          '500': { description: 'Internal error' },
        },
      },
    },

    // ─── User ─────────────────────────────────────────────────────────
    '/api/user/profile': {
      get: {
        operationId: 'getProfile',
        summary: 'Get current user profile',
        description: 'Returns the authenticated user\'s id, email, name, and createdAt.',
        tags: ['User'],
        security: [{ BearerAuth: [] }],
        responses: {
          '200': { description: 'User profile' },
          '401': { description: 'Not authenticated' },
          '404': { description: 'User not found' },
        },
      },
      patch: {
        operationId: 'updateProfile',
        summary: 'Update profile or change password',
        description:
          'Update name, or change password (requires currentPassword + newPassword). ' +
          'Password change invalidates all other sessions.',
        tags: ['User'],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string', minLength: 1, maxLength: 100 },
                  currentPassword: { type: 'string', description: 'Required for password change' },
                  newPassword: { type: 'string', description: 'Required for password change' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Profile updated or password changed' },
          '400': { description: 'Validation error' },
          '401': { description: 'Invalid current password' },
          '429': { description: 'Rate limited' },
          '500': { description: 'Internal error' },
        },
      },
    },

    // ─── Workspace ────────────────────────────────────────────────────
    '/api/workspaces': {
      get: {
        operationId: 'listWorkspaces',
        summary: 'List user\'s workspaces',
        description: 'Returns all workspaces the authenticated user is a member of, ordered by join date.',
        tags: ['Workspace'],
        security: [{ BearerAuth: [] }],
        responses: {
          '200': { description: 'List of workspaces with role' },
          '401': { description: 'Not authenticated' },
        },
      },
      post: {
        operationId: 'createWorkspace',
        summary: 'Create a new workspace',
        description: 'Creates a workspace and seeds it with demo data. User becomes owner.',
        tags: ['Workspace'],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string', minLength: 1, maxLength: 50 },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Workspace created' },
          '400': { description: 'Validation error' },
          '401': { description: 'Not authenticated' },
          '500': { description: 'Internal error' },
        },
      },
    },
    '/api/workspaces/{id}': {
      get: {
        operationId: 'getWorkspace',
        summary: 'Get workspace detail with stats',
        description: 'Returns workspace info, member count, and aggregated stats for layers, agents, disputes, dreamer, and brain.',
        tags: ['Workspace'],
        security: [{ BearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/WorkspaceId' }],
        responses: {
          '200': { description: 'Workspace with stats' },
          '400': { description: 'Invalid workspace ID' },
          '401': { description: 'Not authenticated' },
          '403': { description: 'No access to this workspace' },
          '404': { description: 'Workspace not found' },
        },
      },
      patch: {
        operationId: 'updateWorkspace',
        summary: 'Update workspace name or plan',
        description: 'Only owner or admin can update.',
        tags: ['Workspace'],
        security: [{ BearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/WorkspaceId' }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string', minLength: 1, maxLength: 50 },
                  plan: { type: 'string', enum: ['free', 'pro', 'team'] },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Workspace updated' },
          '400': { description: 'Validation error' },
          '401': { description: 'Not authenticated' },
          '403': { description: 'Only owner or admin' },
          '404': { description: 'Workspace not found' },
        },
      },
      delete: {
        operationId: 'deleteWorkspace',
        summary: 'Delete a workspace',
        description: 'Only the owner can delete. Cascades to all workspace data.',
        tags: ['Workspace'],
        security: [{ BearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/WorkspaceId' }],
        responses: {
          '200': { description: 'Workspace deleted' },
          '400': { description: 'Invalid workspace ID' },
          '401': { description: 'Not authenticated' },
          '403': { description: 'Only owner can delete' },
          '404': { description: 'Workspace not found' },
        },
      },
    },

    // ─── Knowledge: Search ────────────────────────────────────────────
    '/api/search': {
      get: {
        operationId: 'search',
        summary: 'Full-text search across knowledge base',
        description: 'Searches facts, decisions, and ledger entries. Requires at least 2 characters.',
        tags: ['Knowledge'],
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'q', in: 'query', required: true, description: 'Search query', schema: { type: 'string', minLength: 2 } },
          { name: 'topic', in: 'query', required: false, description: 'Filter by topic', schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Search results (facts, decisions, ledger)' },
          '401': { description: 'Not authenticated' },
        },
      },
    },

    // ─── Knowledge: Facts ─────────────────────────────────────────────
    '/api/facts': {
      get: {
        operationId: 'listFacts',
        summary: 'List facts',
        description: 'Paginated list of facts with optional topic, stale, and superseded filters.',
        tags: ['Knowledge'],
        security: [{ BearerAuth: [] }],
        parameters: [
          { $ref: '#/components/parameters/Limit' },
          { $ref: '#/components/parameters/Offset' },
          { name: 'topic', in: 'query', required: false, schema: { type: 'string' } },
          { name: 'stale', in: 'query', required: false, description: 'Include stale facts', schema: { type: 'boolean', default: false } },
          { name: 'superseded', in: 'query', required: false, description: 'Include superseded facts', schema: { type: 'boolean', default: false } },
        ],
        responses: {
          '200': { description: 'Paginated fact list' },
          '401': { description: 'Not authenticated' },
        },
      },
      post: {
        operationId: 'createFact',
        summary: 'Create a new fact',
        description: 'Adds a fact to the knowledge base. Primary entry point for MCP tools and agents.',
        tags: ['Knowledge'],
        security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['topic', 'entity', 'attribute', 'statement'],
                properties: {
                  topic: { type: 'string', maxLength: 100 },
                  entity: { type: 'string', maxLength: 200 },
                  attribute: { type: 'string', maxLength: 200 },
                  statement: { type: 'string', maxLength: 5000 },
                  confidence: { type: 'string', enum: ['low', 'medium', 'high', 'verified'], default: 'medium' },
                  source: { type: 'string', maxLength: 500 },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Fact created' },
          '400': { description: 'Validation error' },
          '401': { description: 'Not authenticated' },
          '500': { description: 'Internal error' },
        },
      },
    },

    // ─── Knowledge: Ledger ────────────────────────────────────────────
    '/api/ledger': {
      get: {
        operationId: 'listLedger',
        summary: 'List ledger entries',
        description: 'Raw ingestion feed — entries written by agents. Supports filtering by topic, agentId, and kind.',
        tags: ['Knowledge'],
        security: [{ BearerAuth: [] }],
        parameters: [
          { $ref: '#/components/parameters/Limit' },
          { $ref: '#/components/parameters/Offset' },
          { name: 'topic', in: 'query', required: false, schema: { type: 'string' } },
          { name: 'agentId', in: 'query', required: false, schema: { type: 'string' } },
          { name: 'kind', in: 'query', required: false, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Ledger entries' },
          '401': { description: 'Not authenticated' },
        },
      },
      post: {
        operationId: 'createLedgerEntry',
        summary: 'Append a ledger entry',
        description: 'Primary ingestion endpoint for MCP agents. Rate limited: 30 per minute.',
        tags: ['Knowledge'],
        security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['topic', 'content'],
                properties: {
                  topic: { type: 'string', maxLength: 200 },
                  content: { type: 'string' },
                  kind: { type: 'string', maxLength: 50 },
                  agentId: { type: 'string', maxLength: 100 },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Entry created' },
          '400': { description: 'Validation error' },
          '401': { description: 'Not authenticated' },
          '429': { description: 'Rate limited' },
        },
      },
    },

    // ─── Knowledge: Decisions ─────────────────────────────────────────
    '/api/decisions': {
      get: {
        operationId: 'listDecisions',
        summary: 'List decisions',
        description: 'Paginated list of decisions, filterable by topic and status.',
        tags: ['Knowledge'],
        security: [{ BearerAuth: [] }],
        parameters: [
          { $ref: '#/components/parameters/Limit' },
          { $ref: '#/components/parameters/Offset' },
          { name: 'topic', in: 'query', required: false, schema: { type: 'string' } },
          { name: 'status', in: 'query', required: false, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Paginated decisions' },
          '401': { description: 'Not authenticated' },
        },
      },
    },
    '/api/decisions/review': {
      post: {
        operationId: 'reviewDecision',
        summary: 'Record a decision outcome',
        description: 'Marks a decision with its outcome and optionally a lesson learned. Status auto-detected from outcome text.',
        tags: ['Knowledge'],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['id', 'outcome'],
                properties: {
                  id: { type: 'integer', description: 'Decision ID' },
                  outcome: { type: 'string', minLength: 1, description: 'Free-text outcome' },
                  lesson: { type: 'string', description: 'Lesson learned (optional)' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Decision updated with outcome' },
          '400': { description: 'Validation error' },
          '401': { description: 'Not authenticated' },
          '404': { description: 'Decision not found' },
        },
      },
    },

    // ─── Knowledge: Disputes ──────────────────────────────────────────
    '/api/disputes': {
      get: {
        operationId: 'listDisputes',
        summary: 'List disputes',
        description: 'Paginated list of disputes in the workspace.',
        tags: ['Knowledge'],
        security: [{ BearerAuth: [] }],
        parameters: [
          { $ref: '#/components/parameters/Limit' },
          { $ref: '#/components/parameters/Offset' },
        ],
        responses: {
          '200': { description: 'Paginated disputes' },
          '401': { description: 'Not authenticated' },
        },
      },
    },
    '/api/disputes/resolve': {
      post: {
        operationId: 'resolveDispute',
        summary: 'Resolve a dispute',
        description:
          'Resolves an open dispute with a ruling and winner. Updates fact supersession and marks topic brief as dirty.',
        tags: ['Knowledge'],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['id', 'ruling', 'winner'],
                properties: {
                  id: { type: 'integer' },
                  ruling: { type: 'string', minLength: 10, description: 'Ruling explanation' },
                  winner: { type: 'string', enum: ['existing', 'incoming'] },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Dispute resolved' },
          '400': { description: 'Validation error' },
          '401': { description: 'Not authenticated' },
          '404': { description: 'Dispute not found' },
          '409': { description: 'Dispute already resolved' },
        },
      },
    },

    // ─── Knowledge: Briefs ────────────────────────────────────────────
    '/api/briefs': {
      get: {
        operationId: 'listBriefs',
        summary: 'List all briefs',
        description: 'Paginated list of topic briefs (L3 — curated knowledge summaries).',
        tags: ['Knowledge'],
        security: [{ BearerAuth: [] }],
        parameters: [
          { $ref: '#/components/parameters/Limit' },
          { $ref: '#/components/parameters/Offset' },
        ],
        responses: {
          '200': { description: 'Paginated briefs' },
          '401': { description: 'Not authenticated' },
        },
      },
    },
    '/api/briefs/{topic}': {
      get: {
        operationId: 'getBriefByTopic',
        summary: 'Get detailed brief for a topic',
        description:
          'Returns the brief content plus SZIKRA (top spark), ESEDÉKES (open disputes & upcoming reviews), ' +
          'KURÁLT (curated content), and FAROK (unprocessed ledger tail).',
        tags: ['Knowledge'],
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'topic', in: 'path', required: true, description: 'Topic slug', schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Detailed brief with all sections' },
          '401': { description: 'Not authenticated' },
          '404': { description: 'Brief not found for topic' },
        },
      },
    },

    // ─── Knowledge: Stats ─────────────────────────────────────────────
    '/api/stats': {
      get: {
        operationId: 'getStats',
        summary: 'Get comprehensive workspace statistics',
        description: 'Aggregated stats across all layers (L1-L3), dreamer, brain, disputes, agents, and librarian.',
        tags: ['Knowledge'],
        security: [{ BearerAuth: [] }],
        responses: {
          '200': { description: 'Full workspace statistics' },
          '401': { description: 'Not authenticated' },
        },
      },
    },

    // ─── Knowledge: Activity ──────────────────────────────────────────
    '/api/activity': {
      get: {
        operationId: 'getActivity',
        summary: 'Get unified activity timeline',
        description: 'Merged timeline of ledger entries, librarian runs, and dispute resolutions (last 50 items).',
        tags: ['Knowledge'],
        security: [{ BearerAuth: [] }],
        responses: {
          '200': { description: 'Activity timeline' },
          '401': { description: 'Not authenticated' },
        },
      },
    },

    // ─── Knowledge: Preferences ───────────────────────────────────────
    '/api/preferences': {
      get: {
        operationId: 'getPreferences',
        summary: 'List active preferences',
        description: 'Returns all active workspace preferences.',
        tags: ['Knowledge'],
        security: [{ BearerAuth: [] }],
        responses: {
          '200': { description: 'Preferences list' },
          '401': { description: 'Not authenticated' },
        },
      },
    },

    // ─── Brain ────────────────────────────────────────────────────────
    '/api/brain/query': {
      post: {
        operationId: 'brainQuery',
        summary: 'Execute a brain query',
        description:
          'Neural knowledge graph query — spreads activation through associations to find relevant facts. ' +
          'Rate limited: 20 per minute.',
        tags: ['Brain'],
        security: [{ BearerAuth: [] }, { ApiKeyAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['query'],
                properties: {
                  query: { type: 'string', minLength: 2, maxLength: 5000 },
                  limit: { type: 'integer', minimum: 1, maximum: 50 },
                  iterations: { type: 'integer', minimum: 1, maximum: 5 },
                  activationThreshold: { type: 'number', minimum: 0, maximum: 1 },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Brain query results with activated facts' },
          '400': { description: 'Validation error' },
          '401': { description: 'Not authenticated' },
          '429': { description: 'Rate limited' },
        },
      },
    },
    '/api/brain/graph': {
      get: {
        operationId: 'getBrainGraph',
        summary: 'Get knowledge graph',
        description: 'Returns the full knowledge graph (nodes and edges) for the workspace.',
        tags: ['Brain'],
        security: [{ BearerAuth: [] }],
        responses: {
          '200': { description: 'Knowledge graph data' },
          '401': { description: 'Not authenticated' },
        },
      },
    },
    '/api/brain/insights': {
      get: {
        operationId: 'getInsights',
        summary: 'List brain insights',
        description: 'Returns existing AI-generated insights for the workspace.',
        tags: ['Brain'],
        security: [{ BearerAuth: [] }],
        responses: {
          '200': { description: 'Insights list' },
          '401': { description: 'Not authenticated' },
        },
      },
      post: {
        operationId: 'generateInsights',
        summary: 'Trigger insight generation',
        description: 'Analyzes the knowledge base and creates new insight records.',
        tags: ['Brain'],
        security: [{ BearerAuth: [] }],
        responses: {
          '201': { description: 'Insights generated' },
          '401': { description: 'Not authenticated' },
          '500': { description: 'Generation failed' },
        },
      },
      patch: {
        operationId: 'dismissInsight',
        summary: 'Dismiss or undismiss an insight',
        description: 'Toggle the dismissed state of an insight.',
        tags: ['Brain'],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['id', 'dismissed'],
                properties: {
                  id: { type: 'integer' },
                  dismissed: { type: 'boolean' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Insight updated' },
          '400': { description: 'Validation error' },
          '401': { description: 'Not authenticated' },
          '404': { description: 'Insight not found' },
        },
      },
    },
    '/api/brain/gaps': {
      get: {
        operationId: 'getKnowledgeGaps',
        summary: 'Identify knowledge gaps',
        description: 'Analyzes the knowledge base to find topics and areas lacking sufficient coverage.',
        tags: ['Brain'],
        security: [{ BearerAuth: [] }],
        responses: {
          '200': { description: 'Knowledge gap analysis' },
          '401': { description: 'Not authenticated' },
        },
      },
    },
    '/api/brain/neural-stats': {
      get: {
        operationId: 'getNeuralStats',
        summary: 'Get neural network statistics',
        description: 'Returns stats about the neural knowledge graph: node counts, edge density, activation distribution.',
        tags: ['Brain'],
        security: [{ BearerAuth: [] }],
        responses: {
          '200': { description: 'Neural statistics' },
          '401': { description: 'Not authenticated' },
        },
      },
    },
    '/api/brain/plasticity': {
      post: {
        operationId: 'runPlasticity',
        summary: 'Run synaptic plasticity (decay)',
        description:
          'Applies forgetting-curve decay to association weights and fact activation scores. ' +
          'Implements Hebbian long-term potentiation for frequently used associations.',
        tags: ['Brain'],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  decayRate: { type: 'number', minimum: 0.001, maximum: 0.5, default: 0.005, description: 'Decay rate per day idle' },
                  minWeight: { type: 'number', minimum: 0.01, maximum: 0.5, default: 0.05, description: 'Minimum association weight' },
                  dryRun: { type: 'boolean', default: false, description: 'Preview changes without applying' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Plasticity run results' },
          '401': { description: 'Not authenticated' },
          '409': { description: 'Plasticity already in progress' },
        },
      },
    },
    '/api/brain/associations': {
      get: {
        operationId: 'getAssociations',
        summary: 'List knowledge associations',
        description: 'Returns fact-to-fact associations ordered by strength. Optionally filter by topic.',
        tags: ['Brain'],
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'topic', in: 'query', required: false, description: 'Filter by topic on factA', schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Association list with fact details' },
          '401': { description: 'Not authenticated' },
        },
      },
    },

    // ─── Dreamer ──────────────────────────────────────────────────────
    '/api/sparks': {
      get: {
        operationId: 'listSparks',
        summary: 'List sparks with aggregate stats',
        description:
          'Returns sparks with filters (topic, rated, delivered, kind) and aggregate stats ' +
          '(hit rate, avg score, by-kind breakdown).',
        tags: ['Dreamer'],
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'topic', in: 'query', required: false, schema: { type: 'string' } },
          { name: 'rated', in: 'query', required: false, schema: { type: 'boolean' } },
          { name: 'delivered', in: 'query', required: false, schema: { type: 'boolean' } },
          { name: 'kind', in: 'query', required: false, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Sparks and aggregate stats' },
          '401': { description: 'Not authenticated' },
        },
      },
    },
    '/api/sparks/rate': {
      post: {
        operationId: 'rateSpark',
        summary: 'Rate a spark (hit/miss)',
        description: 'Records whether a spark was useful. Updates spark_weights for pair reinforcement.',
        tags: ['Dreamer'],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['id', 'hit'],
                properties: {
                  id: { type: 'integer', description: 'Spark ID' },
                  hit: { type: 'boolean', description: 'True = useful, False = miss' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Spark rated and weights updated' },
          '400': { description: 'Validation error' },
          '401': { description: 'Not authenticated' },
          '404': { description: 'Spark not found' },
        },
      },
    },
    '/api/dreamer/run': {
      get: {
        operationId: 'getDreamerStatus',
        summary: 'Get Dreamer status',
        description: 'Returns Dreamer readiness, running state, topic coverage, explored pairs, and recent sparks.',
        tags: ['Dreamer'],
        security: [{ BearerAuth: [] }],
        responses: {
          '200': { description: 'Dreamer status and pair coverage data' },
          '401': { description: 'Not authenticated' },
        },
      },
      post: {
        operationId: 'runDreamer',
        summary: 'Trigger Dreamer run',
        description: 'Runs the Dreamer to generate cross-topic sparks. Only owner or admin. Rate limited: 5/min.',
        tags: ['Dreamer'],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: { type: 'object', description: 'Empty body — Dreamer runs with current workspace state' },
            },
          },
        },
        responses: {
          '200': { description: 'Dreamer run completed' },
          '401': { description: 'Not authenticated' },
          '403': { description: 'Only owner or admin' },
          '409': { description: 'Dreamer already running' },
          '429': { description: 'Rate limited' },
        },
      },
    },

    // ─── Agents ───────────────────────────────────────────────────────
    '/api/agents': {
      get: {
        operationId: 'listAgents',
        summary: 'List agents with stats',
        description: 'Returns agents with their ledger entry counts and last activity timestamps.',
        tags: ['Agents'],
        security: [{ BearerAuth: [] }],
        parameters: [
          { $ref: '#/components/parameters/Limit' },
          { $ref: '#/components/parameters/Offset' },
        ],
        responses: {
          '200': { description: 'Paginated agents with stats' },
          '401': { description: 'Not authenticated' },
        },
      },
    },
    '/api/librarian': {
      get: {
        operationId: 'getLibrarianStatus',
        summary: 'Get Librarian status',
        description: 'Returns last run status, unprocessed ledger count, and running state.',
        tags: ['Agents'],
        security: [{ BearerAuth: [] }],
        responses: {
          '200': { description: 'Librarian status' },
          '401': { description: 'Not authenticated' },
        },
      },
      post: {
        operationId: 'runLibrarian',
        summary: 'Trigger Librarian run',
        description:
          'Runs the Librarian to process unprocessed ledger entries: extract facts, decisions, detect disputes, rebuild briefs. ' +
          'Only owner or admin. Rate limited: 5/min.',
        tags: ['Agents'],
        security: [{ BearerAuth: [] }],
        responses: {
          '200': { description: 'Librarian run completed' },
          '401': { description: 'Not authenticated' },
          '403': { description: 'Only owner or admin' },
          '409': { description: 'Librarian already running' },
          '429': { description: 'Rate limited' },
        },
      },
    },
    '/api/librarian-runs': {
      get: {
        operationId: 'listLibrarianRuns',
        summary: 'List recent Librarian runs',
        description: 'Returns the last 20 Librarian runs for the workspace.',
        tags: ['Agents'],
        security: [{ BearerAuth: [] }],
        responses: {
          '200': { description: 'Librarian run history' },
          '401': { description: 'Not authenticated' },
        },
      },
    },

    // ─── Settings ─────────────────────────────────────────────────────
    '/api/settings': {
      get: {
        operationId: 'getSettings',
        summary: 'Get workspace settings',
        description: 'Returns scheduler settings (Dreamer & Librarian enabled/schedule) or defaults if not configured.',
        tags: ['Settings'],
        security: [{ BearerAuth: [] }],
        responses: {
          '200': { description: 'Workspace settings' },
          '401': { description: 'Not authenticated' },
        },
      },
      patch: {
        operationId: 'updateSettings',
        summary: 'Update workspace settings',
        description: 'Upsert scheduler settings. Only owner or admin. Validates cron expressions and IANA timezones.',
        tags: ['Settings'],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  dreamerEnabled: { type: 'boolean' },
                  dreamerSchedule: { type: 'string', description: 'Cron expression (5-6 fields)' },
                  librarianEnabled: { type: 'boolean' },
                  librarianSchedule: { type: 'string', description: 'Cron expression (5-6 fields)' },
                  timezone: { type: 'string', description: 'IANA timezone (e.g. Europe/Budapest)' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Settings updated' },
          '400': { description: 'Invalid cron or timezone' },
          '401': { description: 'Not authenticated' },
          '403': { description: 'Csak owner vagy admin módosíthatja a beállításokat' },
          '500': { description: 'Internal error' },
        },
      },
    },

    // ─── MCP ──────────────────────────────────────────────────────────
    '/api/mcp': {
      get: {
        operationId: 'mcpGet',
        summary: 'MCP endpoint (GET)',
        description: 'MCP Streamable HTTP transport — session listing. Authenticated via API key in Authorization header.',
        tags: ['MCP'],
        security: [{ ApiKeyAuth: [] }],
        responses: {
          '200': { description: 'MCP session info' },
          '401': { description: 'Invalid API key' },
          '405': { description: 'Method not allowed' },
        },
      },
      post: {
        operationId: 'mcpPost',
        summary: 'MCP tool invocation',
        description:
          'MCP Streamable HTTP transport — invokes brain tools (brain_query, create_fact, create_ledger_entry, ' +
          'search_knowledge, list_topics, etc.). Authenticated via API key in Authorization header. ' +
          'Rate limited: 60 per minute per workspace.',
        tags: ['MCP'],
        security: [{ ApiKeyAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                description: 'MCP JSON-RPC request (jsonrpc, method, params, id)',
                properties: {
                  jsonrpc: { type: 'string', example: '2.0' },
                  method: { type: 'string', example: 'tools/call' },
                  params: { type: 'object' },
                  id: { type: 'integer' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'MCP JSON-RPC response' },
          '400': { description: 'Invalid MCP request' },
          '401': { description: 'Invalid API key' },
          '429': { description: 'Rate limited' },
          '500': { description: 'Tool execution error' },
        },
      },
      options: {
        operationId: 'mcpOptions',
        summary: 'MCP CORS preflight',
        description: 'Handles CORS preflight for MCP endpoint.',
        tags: ['MCP'],
        security: [],
        responses: { '204': { description: 'CORS preflight response' } },
      },
    },

    // ─── Scheduler ────────────────────────────────────────────────────
    '/api/scheduler/tick': {
      post: {
        operationId: 'schedulerTick',
        summary: 'Trigger scheduled tasks',
        description:
          'Internal endpoint called by cron to run due Dreamer and Librarian tasks. ' +
          'Requires SCHEDULER_SECRET in Authorization header (timing-safe comparison).',
        tags: ['Scheduler'],
        security: [{ SchedulerAuth: [] }],
        responses: {
          '200': { description: 'Tick completed', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, ran: { type: 'array', items: { type: 'object' } } } } } } },
          '401': { description: 'Invalid or missing authorization' },
          '403': { description: 'SCHEDULER_SECRET not configured' },
          '500': { description: 'Internal error' },
        },
      },
    },

    // ─── GDPR ─────────────────────────────────────────────────────────
    '/api/gdpr/audit': {
      get: {
        operationId: 'getGdprAudit',
        summary: 'Get GDPR audit log',
        description: 'Returns paginated audit log entries for the authenticated user.',
        tags: ['GDPR'],
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 } },
          { name: 'offset', in: 'query', required: false, schema: { type: 'integer', minimum: 0, default: 0 } },
        ],
        responses: {
          '200': { description: 'Audit log entries with total count' },
          '401': { description: 'Not authenticated' },
        },
      },
    },
    '/api/gdpr/consent': {
      get: {
        operationId: 'getConsents',
        summary: 'Get consent records',
        description: 'Returns all consent records for the authenticated user.',
        tags: ['GDPR'],
        security: [{ BearerAuth: [] }],
        responses: {
          '200': { description: 'Consent records' },
          '401': { description: 'Not authenticated' },
        },
      },
      post: {
        operationId: 'upsertConsent',
        summary: 'Grant or revoke consent',
        description: 'Creates or updates a consent record. Audits the action.',
        tags: ['GDPR'],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['kind', 'granted'],
                properties: {
                  kind: { type: 'string', minLength: 1 },
                  granted: { type: 'boolean' },
                  ipAddress: { type: 'string' },
                  userAgent: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Consent upserted' },
          '400': { description: 'Validation error' },
          '401': { description: 'Not authenticated' },
        },
      },
    },
    '/api/gdpr/privacy': {
      get: {
        operationId: 'getPrivacyPolicy',
        summary: 'Get privacy policy',
        description: 'Returns the GDPR privacy policy: data collected, purposes, legal basis, retention periods, user rights.',
        tags: ['GDPR'],
        security: [],
        responses: {
          '200': { description: 'Privacy policy' },
        },
      },
    },
    '/api/gdpr/retention': {
      get: {
        operationId: 'getRetentionSummary',
        summary: 'Get data retention summary',
        description: 'Returns counts of data older than 90 days across all user workspaces.',
        tags: ['GDPR'],
        security: [{ BearerAuth: [] }],
        responses: {
          '200': { description: 'Retention summary by data type' },
          '401': { description: 'Not authenticated' },
        },
      },
      post: {
        operationId: 'runRetentionPurge',
        summary: 'Purge expired data',
        description: 'Deletes audit logs older than 90 days and marks expired data exports. Runs in a transaction.',
        tags: ['GDPR'],
        security: [{ BearerAuth: [] }],
        responses: {
          '200': { description: 'Purge completed', content: { 'application/json': { schema: { type: 'object', properties: { deleted: { type: 'integer' } } } } } },
          '401': { description: 'Not authenticated' },
        },
      },
    },
    '/api/gdpr/erase': {
      post: {
        operationId: 'eraseAllData',
        summary: 'GDPR right to erasure',
        description:
          'Permanently deletes all user data: account, workspaces, and all associated content. ' +
          'Runs in a transaction. Rate limited: 3 per hour. Demo account (ID 1) is protected.',
        tags: ['GDPR'],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: { type: 'object', description: 'Empty body — erases all data for the authenticated user' },
            },
          },
        },
        responses: {
          '200': { description: 'All data permanently deleted' },
          '401': { description: 'Not authenticated' },
          '403': { description: 'Demo account cannot be erased' },
          '429': { description: 'Rate limited' },
          '500': { description: 'Internal error' },
        },
      },
    },
    '/api/gdpr/export': {
      get: {
        operationId: 'getExports',
        summary: 'List data exports',
        description: 'Returns all data export requests. Auto-generates pending exports older than 1 minute.',
        tags: ['GDPR'],
        security: [{ BearerAuth: [] }],
        responses: {
          '200': { description: 'List of data exports' },
          '401': { description: 'Not authenticated' },
        },
      },
      post: {
        operationId: 'requestExport',
        summary: 'Request data export (GDPR Art. 20)',
        description: 'Creates a data export request. Export is generated asynchronously and available for 30 days.',
        tags: ['GDPR'],
        security: [{ BearerAuth: [] }],
        responses: {
          '201': { description: 'Export request created' },
          '401': { description: 'Not authenticated' },
        },
      },
    },

    // ─── Contest ──────────────────────────────────────────────────────
    '/api/contest/contests': {
      get: {
        operationId: 'listContests',
        summary: 'List contests',
        description: 'Returns contests with entry and challenge counts. Optionally filter by status.',
        tags: ['Contest'],
        security: [],
        parameters: [
          { name: 'status', in: 'query', required: false, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Contests list' },
        },
      },
      post: {
        operationId: 'createContest',
        summary: 'Create a contest',
        description: 'Creates a new knowledge contest. User becomes the creator.',
        tags: ['Contest'],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['title', 'description', 'kind', 'startsAt', 'endsAt'],
                properties: {
                  title: { type: 'string', minLength: 1 },
                  description: { type: 'string', minLength: 1 },
                  kind: { type: 'string', enum: ['knowledge-completeness', 'freshness-challenge', 'association-density', 'decision-outcome', 'weekly-quiz'] },
                  startsAt: { type: 'string' },
                  endsAt: { type: 'string' },
                  prize: { type: 'string' },
                  rules: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Contest created' },
          '400': { description: 'Validation error' },
          '401': { description: 'Not authenticated' },
        },
      },
    },
    '/api/contest/contests/{id}': {
      get: {
        operationId: 'getContest',
        summary: 'Get contest detail',
        description: 'Returns contest with challenges and ranked entries.',
        tags: ['Contest'],
        security: [{ BearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/ContestId' }],
        responses: {
          '200': { description: 'Contest with challenges and entries' },
          '400': { description: 'Invalid contest ID' },
          '401': { description: 'Not authenticated' },
          '404': { description: 'Contest not found' },
        },
      },
      patch: {
        operationId: 'updateContest',
        summary: 'Update a contest',
        description: 'Only the contest creator can modify.',
        tags: ['Contest'],
        security: [{ BearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/ContestId' }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  title: { type: 'string', minLength: 1 },
                  description: { type: 'string', minLength: 1 },
                  status: { type: 'string' },
                  endsAt: { type: 'string' },
                  prize: { type: 'string', nullable: true },
                  rules: { type: 'string', nullable: true },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Contest updated' },
          '400': { description: 'Validation error' },
          '401': { description: 'Not authenticated' },
          '403': { description: 'Only creator can modify' },
          '404': { description: 'Contest not found' },
        },
      },
      delete: {
        operationId: 'deleteContest',
        summary: 'Delete a contest',
        description: 'Only the contest creator can delete. Entries and challenges cascade.',
        tags: ['Contest'],
        security: [{ BearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/ContestId' }],
        responses: {
          '200': { description: 'Contest deleted' },
          '400': { description: 'Invalid contest ID' },
          '401': { description: 'Not authenticated' },
          '403': { description: 'Only creator can delete' },
          '404': { description: 'Contest not found' },
        },
      },
    },
    '/api/contest/challenges': {
      get: {
        operationId: 'listChallenges',
        summary: 'List challenges for a contest',
        description: 'Returns challenges for a given contest (up to 100).',
        tags: ['Contest'],
        security: [],
        parameters: [
          { name: 'contestId', in: 'query', required: true, schema: { type: 'integer' } },
        ],
        responses: {
          '200': { description: 'Challenge list' },
          '400': { description: 'Valid contestId required' },
        },
      },
      post: {
        operationId: 'createChallenge',
        summary: 'Add a challenge to a contest',
        description: 'Only the contest creator can add challenges.',
        tags: ['Contest'],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['contestId', 'title', 'description', 'kind'],
                properties: {
                  contestId: { type: 'integer' },
                  title: { type: 'string', minLength: 1 },
                  description: { type: 'string', minLength: 1 },
                  kind: { type: 'string', minLength: 1 },
                  points: { type: 'integer', minimum: 1, default: 100 },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Challenge created' },
          '400': { description: 'Validation error' },
          '401': { description: 'Not authenticated' },
          '403': { description: 'Only creator can add challenges' },
          '404': { description: 'Contest not found' },
        },
      },
    },
    '/api/contest/enter': {
      post: {
        operationId: 'enterContest',
        summary: 'Enter a workspace into a contest',
        description: 'Upserts a contest entry with an initial score based on workspace knowledge stats.',
        tags: ['Contest'],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['contestId'],
                properties: {
                  contestId: { type: 'integer' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Entry created/updated with score' },
          '400': { description: 'Validation error' },
          '401': { description: 'Not authenticated' },
          '404': { description: 'Contest not found' },
        },
      },
    },
    '/api/contest/score': {
      post: {
        operationId: 'submitScore',
        summary: 'Submit / refresh contest score',
        description:
          'Calculates a detailed score breakdown: facts, decisions, associations, insights, sparks, topic breadth, freshness bonus. ' +
          'Updates rank for all entries.',
        tags: ['Contest'],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['contestId'],
                properties: {
                  contestId: { type: 'integer' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Score, rank, and breakdown' },
          '400': { description: 'Validation error' },
          '401': { description: 'Not authenticated' },
          '404': { description: 'Contest not found' },
        },
      },
    },
    '/api/contest/leaderboard': {
      get: {
        operationId: 'getLeaderboard',
        summary: 'Get contest leaderboard',
        description: 'Returns ranked entries for a contest with workspace info.',
        tags: ['Contest'],
        security: [],
        parameters: [
          { name: 'contestId', in: 'query', required: true, schema: { type: 'integer' } },
        ],
        responses: {
          '200': { description: 'Leaderboard with ranks' },
          '400': { description: 'Valid contestId required' },
          '404': { description: 'Contest not found' },
        },
      },
    },
    '/api/contest/achievements': {
      get: {
        operationId: 'getAchievements',
        summary: 'Get workspace achievements',
        description: 'Returns all earned achievements for the workspace.',
        tags: ['Contest'],
        security: [{ BearerAuth: [] }],
        responses: {
          '200': { description: 'Achievements list' },
          '401': { description: 'Not authenticated' },
        },
      },
      post: {
        operationId: 'checkAchievements',
        summary: 'Check and award new achievements',
        description:
          'Evaluates workspace stats against achievement definitions. Awards any newly earned badges. ' +
          'Badges: first-fact, knowledge-builder, decision-maker, well-connected, brain-awake, spark-igniter, contender, knowledge-complete, fresh-mind.',
        tags: ['Contest'],
        security: [{ BearerAuth: [] }],
        responses: {
          '200': { description: 'New achievements, total count, total points' },
          '401': { description: 'Not authenticated' },
        },
      },
    },
  },

  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        description: 'JWT session token obtained from NextAuth sign-in.',
      },
      ApiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'Authorization',
        description: 'MCP agent API key in Authorization header (format: "Bearer <api-key>" or raw key).',
      },
      SchedulerAuth: {
        type: 'http',
        scheme: 'bearer',
        description: 'Internal scheduler secret (SCHEDULER_SECRET env var). Timing-safe comparison.',
      },
    },
    parameters: {
      WorkspaceId: {
        name: 'id',
        in: 'path',
        required: true,
        description: 'Workspace numeric ID',
        schema: { type: 'integer' },
      },
      ContestId: {
        name: 'id',
        in: 'path',
        required: true,
        description: 'Contest numeric ID',
        schema: { type: 'integer' },
      },
      Limit: {
        name: 'limit',
        in: 'query',
        required: false,
        description: 'Page size (1–100)',
        schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      },
      Offset: {
        name: 'offset',
        in: 'query',
        required: false,
        description: 'Offset for pagination',
        schema: { type: 'integer', minimum: 0, default: 0 },
      },
    },
    schemas: {
      ErrorResponse: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          message: { type: 'string' },
          details: { type: 'object', additionalProperties: true },
        },
      },
      HealthResponse: {
        type: 'object',
        properties: {
          status: { type: 'string', example: 'ok' },
          version: { type: 'string', example: '5.2.0' },
          uptime: { type: 'integer', description: 'Seconds since server start' },
          db: { type: 'string', example: 'connected' },
          checks: {
            type: 'object',
            properties: { factTableAccessible: { type: 'boolean' } },
          },
          activeTaskLocks: {
            type: 'array',
            items: { type: 'string' },
            nullable: true,
          },
        },
      },
      RegisterResponse: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          email: { type: 'string' },
          name: { type: 'string' },
          createdAt: { type: 'string' },
          workspace: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              name: { type: 'string' },
              slug: { type: 'string' },
              plan: { type: 'string' },
            },
          },
        },
      },
      PaginatedResponse: {
        type: 'object',
        description: 'Generic paginated response envelope',
        properties: {
          data: { type: 'array', items: { type: 'object' } },
          total: { type: 'integer' },
          limit: { type: 'integer' },
          offset: { type: 'integer' },
        },
      },
    },
  },
} as const;

export async function GET() {
  return NextResponse.json(openApiSpec);
}
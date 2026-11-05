/** OpenAPI spec behind /docs and /docs.json; also the source of the generated Postman collection. */

type Json = Record<string, unknown>;

interface OperationSpec {
  tag: string;
  summary: string;
  description?: string;
  auth?: 'bearer' | 'refresh' | 'none';
  deviceHeaders?: boolean;
  path?: string[];
  query?: Json[];
  body?: { schema: Json; examples?: Record<string, Json> };
  status?: number;
  data?: Json;
  errors?: number[];
  produces?: string;
}

const ref = (name: string): Json => ({ $ref: `#/components/schemas/${name}` });
const param = (name: string): Json => ({ $ref: `#/components/parameters/${name}` });
const objectId = { type: 'string', pattern: '^[a-f0-9]{24}$', example: '66f1c0ffee00000000000001' };
const paise = {
  type: 'integer',
  minimum: 1,
  description: 'Amount in paise (₹12.50 = 1250)',
  example: 120000,
};

const queryParam = (name: string, schema: Json, description?: string): Json => ({
  in: 'query',
  name,
  required: false,
  schema,
  ...(description ? { description } : {}),
});

const paginationQuery = (sortFields: string[], defaultSort: string): Json[] => [
  queryParam('page', { type: 'integer', minimum: 1, default: 1 }),
  queryParam('limit', { type: 'integer', minimum: 1, maximum: 100, default: 20 }),
  queryParam('sortBy', { type: 'string', enum: sortFields, default: defaultSort }),
  queryParam('order', { type: 'string', enum: ['asc', 'desc'], default: 'desc' }),
];

const paginated = (item: string): Json => ({
  type: 'object',
  properties: {
    items: { type: 'array', items: ref(item) },
    page: { type: 'integer' },
    limit: { type: 'integer' },
    total: { type: 'integer' },
    totalPages: { type: 'integer' },
  },
});

const ERROR_DESCRIPTIONS: Record<number, string> = {
  400: 'VALIDATION_ERROR, header errors (DEVICE_ID_REQUIRED, ...) or SPLIT_TOTAL_MISMATCH',
  401: 'UNAUTHORIZED, TOKEN_EXPIRED or REFRESH_TOKEN_REUSED',
  403: 'NOT_GROUP_MEMBER',
  404: 'NOT_FOUND',
  409: 'EMAIL_TAKEN, ALREADY_MEMBER, BALANCE_NOT_SETTLED or CONFLICT',
  429: 'TOO_MANY_ATTEMPTS (see Retry-After)',
  503: 'SERVICE_UNAVAILABLE',
};

function operation(spec: OperationSpec): Json {
  const auth = spec.auth ?? 'bearer';
  const parameters = [
    ...(spec.deviceHeaders === false ? [] : ['DeviceId', 'DeviceType', 'Timezone', 'Lang'].map(param)),
    ...(spec.path ?? []).map(param),
    ...(spec.query ?? []),
  ];
  const status = spec.status ?? 200;
  const errors = new Set([
    ...(spec.deviceHeaders === false ? [] : [400]),
    ...(auth === 'none' ? [] : [401]),
    ...(spec.errors ?? []),
  ]);

  const success: Json =
    spec.produces === 'text/csv'
      ? { description: 'CSV file', content: { 'text/csv': { schema: { type: 'string', format: 'binary' } } } }
      : {
          description: 'Success',
          content: {
            'application/json': {
              schema: {
                allOf: [
                  ref('SuccessEnvelope'),
                  { type: 'object', properties: { data: spec.data ?? { nullable: true } } },
                ],
              },
            },
          },
        };

  return {
    tags: [spec.tag],
    summary: spec.summary,
    ...(spec.description ? { description: spec.description } : {}),
    security: auth === 'bearer' ? [{ bearerAuth: [] }] : auth === 'refresh' ? [{ refreshToken: [] }] : [],
    parameters,
    ...(spec.body
      ? {
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: spec.body.schema,
                ...(spec.body.examples
                  ? {
                      examples: Object.fromEntries(
                        Object.entries(spec.body.examples).map(([k, v]) => [k, { value: v }]),
                      ),
                    }
                  : {}),
              },
            },
          },
        }
      : {}),
    responses: {
      [status]: success,
      ...Object.fromEntries(
        [...errors].sort().map((code) => [code, { $ref: `#/components/responses/Error${code}` }]),
      ),
    },
  };
}

const tokenHeaders = {
  'x-access-token': { description: 'New access token (15 min)', schema: { type: 'string' } },
  'x-refresh-token': {
    description: 'New refresh token (7 days, rotated on every refresh)',
    schema: { type: 'string' },
  },
};

const withTokenHeaders = (op: Json, status: number): Json => {
  const responses = op.responses as Record<string, Json>;
  responses[status] = { ...responses[status], headers: tokenHeaders };
  return op;
};

const expenseBodyExamples = {
  equal: {
    description: 'Dinner',
    amount: 120000,
    paidBy: '66f1c0ffee00000000000001',
    splitType: 'EQUAL',
    participants: ['66f1c0ffee00000000000001', '66f1c0ffee00000000000002'],
    expenseDate: '2026-10-28',
  },
  exact: {
    description: 'Hotel',
    amount: 900000,
    paidBy: '66f1c0ffee00000000000002',
    splitType: 'EXACT',
    splits: [
      { userId: '66f1c0ffee00000000000001', share: 500000 },
      { userId: '66f1c0ffee00000000000002', share: 400000 },
    ],
  },
  percent: {
    description: 'Cab',
    amount: 50000,
    paidBy: '66f1c0ffee00000000000001',
    splitType: 'PERCENT',
    splits: [
      { userId: '66f1c0ffee00000000000001', percent: 33.33 },
      { userId: '66f1c0ffee00000000000002', percent: 66.67 },
    ],
  },
};

const errorResponse = (status: number): Json => ({
  description: ERROR_DESCRIPTIONS[status] ?? 'Error',
  content: { 'application/json': { schema: ref('ErrorEnvelope') } },
});

export const openApiDocument: Json = {
  openapi: '3.0.3',
  info: {
    title: 'SplitEase API',
    version: '1.0.0',
    description: [
      'Splitwise-style group expense sharing. All amounts are integers in **paise** (INR only).',
      '',
      '**Headers**: every `/api/v1` route needs `device_id`, `device_type` (1 Android, 2 iOS, 3 Web), `timezone` (IANA) and `lang` (`en`).',
      '',
      '**Auth**: register / login / refresh return tokens only in the `x-access-token` and `x-refresh-token` response headers. ',
      'Send `Authorization: Bearer <access>` on protected routes and `x-refresh-token` only to `POST /auth/refresh`.',
      '',
      '**Envelopes**: success `{ statusCode, message, data }`, error `{ statusCode, code, message, requestId, details? }`.',
    ].join('\n'),
  },
  servers: [{ url: '/' }],
  tags: [
    { name: 'System' },
    { name: 'Auth' },
    { name: 'Users' },
    { name: 'Groups' },
    { name: 'Expenses' },
    { name: 'Balances' },
    { name: 'Settlements' },
    { name: 'Activity' },
    { name: 'Exports' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      refreshToken: { type: 'apiKey', in: 'header', name: 'x-refresh-token' },
    },
    parameters: {
      DeviceId: {
        in: 'header',
        name: 'device_id',
        required: true,
        schema: { type: 'string', example: 'b7f1c2e4-9a10' },
      },
      DeviceType: {
        in: 'header',
        name: 'device_type',
        required: true,
        schema: { type: 'integer', enum: [1, 2, 3], example: 3 },
      },
      Timezone: {
        in: 'header',
        name: 'timezone',
        required: true,
        schema: { type: 'string', example: 'Asia/Kolkata' },
      },
      Lang: {
        in: 'header',
        name: 'lang',
        required: true,
        schema: { type: 'string', enum: ['en'], example: 'en' },
      },
      GroupId: { in: 'path', name: 'groupId', required: true, schema: objectId },
      ExpenseId: { in: 'path', name: 'expenseId', required: true, schema: objectId },
      MemberUserId: { in: 'path', name: 'userId', required: true, schema: objectId },
      ExportId: { in: 'path', name: 'exportId', required: true, schema: objectId },
    },
    responses: Object.fromEntries(
      [400, 401, 403, 404, 409, 429, 503].map((code) => [`Error${code}`, errorResponse(code)]),
    ),
    schemas: {
      SuccessEnvelope: {
        type: 'object',
        properties: {
          statusCode: { type: 'integer', example: 200 },
          message: { type: 'string', example: 'Expense added' },
          data: {},
        },
      },
      ErrorEnvelope: {
        type: 'object',
        properties: {
          statusCode: { type: 'integer', example: 400 },
          code: { type: 'string', example: 'SPLIT_TOTAL_MISMATCH' },
          message: { type: 'string', example: 'Splits must add up to the expense amount' },
          requestId: { type: 'string', example: '5c1e2f0a-6d7e-4f1b-9a3c-2b1d0e9f8a7c' },
          details: {
            type: 'array',
            items: { type: 'object', properties: { field: { type: 'string' }, message: { type: 'string' } } },
          },
        },
      },
      User: {
        type: 'object',
        properties: { id: objectId, name: { type: 'string' }, email: { type: 'string', format: 'email' } },
      },
      UserRef: { type: 'object', properties: { id: objectId, name: { type: 'string' } } },
      Session: {
        type: 'object',
        properties: {
          sessionId: { type: 'string' },
          deviceId: { type: 'string' },
          deviceType: { type: 'integer' },
          timezone: { type: 'string' },
          lang: { type: 'string' },
          loginAt: { type: 'string', format: 'date-time' },
          lastUsedAt: { type: 'string', format: 'date-time' },
          expiresAt: { type: 'string', format: 'date-time' },
          current: { type: 'boolean' },
        },
      },
      GroupMember: {
        type: 'object',
        properties: {
          userId: objectId,
          name: { type: 'string' },
          email: { type: 'string' },
          joinedAt: { type: 'string', format: 'date-time' },
        },
      },
      Group: {
        type: 'object',
        properties: {
          id: objectId,
          name: { type: 'string', example: 'Goa Trip' },
          createdBy: objectId,
          memberCount: { type: 'integer' },
          members: { type: 'array', items: ref('GroupMember') },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      GroupListItem: {
        type: 'object',
        properties: {
          id: objectId,
          name: { type: 'string' },
          memberCount: { type: 'integer' },
          myBalance: { type: 'integer', description: 'paise; positive = you are owed' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Expense: {
        type: 'object',
        properties: {
          id: objectId,
          groupId: objectId,
          description: { type: 'string' },
          amount: paise,
          currency: { type: 'string', example: 'INR' },
          paidBy: ref('UserRef'),
          splitType: { type: 'string', enum: ['EQUAL', 'EXACT', 'PERCENT'] },
          splits: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                userId: objectId,
                name: { type: 'string' },
                share: { type: 'integer', description: 'paise' },
                percent: { type: 'number' },
              },
            },
          },
          expenseDate: { type: 'string', format: 'date-time' },
          createdBy: objectId,
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      CreateExpense: {
        type: 'object',
        required: ['description', 'amount', 'paidBy', 'splitType'],
        properties: {
          description: { type: 'string', maxLength: 140 },
          amount: paise,
          paidBy: objectId,
          splitType: { type: 'string', enum: ['EQUAL', 'EXACT', 'PERCENT'] },
          participants: {
            type: 'array',
            items: objectId,
            description: 'EQUAL only; defaults to every member',
          },
          splits: {
            type: 'array',
            description: 'EXACT: { userId, share (paise) }; PERCENT: { userId, percent (max 2 decimals) }',
            items: {
              type: 'object',
              properties: { userId: objectId, share: { type: 'integer' }, percent: { type: 'number' } },
            },
          },
          expenseDate: {
            type: 'string',
            example: '2026-10-28',
            description: 'YYYY-MM-DD (in your timezone) or ISO 8601',
          },
        },
      },
      Settlement: {
        type: 'object',
        properties: {
          id: objectId,
          groupId: objectId,
          from: ref('UserRef'),
          to: ref('UserRef'),
          amount: paise,
          note: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Activity: {
        type: 'object',
        properties: {
          id: objectId,
          type: {
            type: 'string',
            enum: ['EXPENSE_ADDED', 'EXPENSE_UPDATED', 'EXPENSE_DELETED', 'SETTLEMENT_ADDED', 'MEMBER_ADDED'],
          },
          groupId: objectId,
          actorId: objectId,
          summary: { type: 'string', example: 'Aman added "Dinner" (₹1,200.00) in "Goa Trip"' },
          payload: { type: 'object' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      ExportStatus: {
        type: 'object',
        properties: {
          exportId: objectId,
          groupId: objectId,
          status: { type: 'string', enum: ['QUEUED', 'PROCESSING', 'DONE', 'FAILED'] },
          progress: { type: 'integer', minimum: 0, maximum: 100 },
          rowCount: { type: 'integer' },
          error: { type: 'string' },
          downloadUrl: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
          completedAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
  paths: {
    '/health': {
      get: operation({
        tag: 'System',
        summary: 'Dependency health (no auth, no device headers)',
        auth: 'none',
        deviceHeaders: false,
        data: {
          type: 'object',
          properties: {
            mongo: { type: 'string', example: 'up' },
            redis: { type: 'string', example: 'up' },
            rabbitmq: { type: 'string', example: 'up' },
          },
        },
        errors: [503],
      }),
    },
    '/api/v1/auth/register': {
      post: withTokenHeaders(
        operation({
          tag: 'Auth',
          summary: 'Create an account and log in (tokens in response headers)',
          auth: 'none',
          status: 201,
          body: {
            schema: {
              type: 'object',
              required: ['name', 'email', 'password'],
              properties: {
                name: { type: 'string', example: 'Aman' },
                email: { type: 'string', example: 'aman@example.com' },
                password: {
                  type: 'string',
                  example: 'Secret@123',
                  description: '8-72 chars, upper, lower, digit, special',
                },
              },
            },
          },
          data: { type: 'object', properties: { user: ref('User') } },
          errors: [409, 429],
        }),
        201,
      ),
    },
    '/api/v1/auth/login': {
      post: withTokenHeaders(
        operation({
          tag: 'Auth',
          summary: 'Log in (5 tries / minute per email + IP)',
          description: "Logging in again on the same device_id replaces that device's previous session.",
          auth: 'none',
          body: {
            schema: {
              type: 'object',
              required: ['email', 'password'],
              properties: {
                email: { type: 'string', example: 'aman@example.com' },
                password: { type: 'string', example: 'Secret@123' },
              },
            },
          },
          data: { type: 'object', properties: { user: ref('User') } },
          errors: [429],
        }),
        200,
      ),
    },
    '/api/v1/auth/refresh': {
      post: withTokenHeaders(
        operation({
          tag: 'Auth',
          summary: 'Rotate tokens (send x-refresh-token header)',
          description:
            'Issues a new pair and invalidates the old refresh token. Re-using an old refresh token revokes the session (401 REFRESH_TOKEN_REUSED).',
          auth: 'refresh',
          data: { type: 'object', properties: { user: ref('User') } },
        }),
        200,
      ),
    },
    '/api/v1/auth/logout': { post: operation({ tag: 'Auth', summary: "End this device's session" }) },
    '/api/v1/auth/logout-all': {
      post: operation({
        tag: 'Auth',
        summary: 'End every session of this user',
        data: { type: 'object', properties: { sessionsEnded: { type: 'integer' } } },
      }),
    },
    '/api/v1/auth/sessions': {
      get: operation({
        tag: 'Auth',
        summary: 'List active devices',
        data: { type: 'object', properties: { sessions: { type: 'array', items: ref('Session') } } },
      }),
    },
    '/api/v1/users/me': {
      get: operation({
        tag: 'Users',
        summary: 'My profile',
        data: { type: 'object', properties: { user: ref('User') } },
      }),
      patch: operation({
        tag: 'Users',
        summary: 'Update my name',
        body: {
          schema: {
            type: 'object',
            required: ['name'],
            properties: { name: { type: 'string', example: 'Aman Verma' } },
          },
        },
        data: { type: 'object', properties: { user: ref('User') } },
      }),
    },
    '/api/v1/users/search': {
      get: operation({
        tag: 'Users',
        summary: 'Find a user by exact email',
        query: [
          {
            in: 'query',
            name: 'email',
            required: true,
            schema: { type: 'string', example: 'rahul@example.com' },
          },
        ],
        data: { type: 'object', properties: { user: ref('User') } },
        errors: [404, 429],
      }),
    },
    '/api/v1/groups': {
      post: operation({
        tag: 'Groups',
        summary: 'Create a group (creator becomes a member)',
        status: 201,
        body: {
          schema: {
            type: 'object',
            required: ['name'],
            properties: { name: { type: 'string', example: 'Goa Trip' } },
          },
        },
        data: { type: 'object', properties: { group: ref('Group') } },
      }),
      get: operation({
        tag: 'Groups',
        summary: 'My groups with my balance in each',
        query: paginationQuery(['createdAt', 'updatedAt', 'name'], 'createdAt'),
        data: paginated('GroupListItem'),
      }),
    },
    '/api/v1/groups/{groupId}': {
      get: operation({
        tag: 'Groups',
        summary: 'Group details and members',
        path: ['GroupId'],
        data: { type: 'object', properties: { group: ref('Group') } },
        errors: [403, 404],
      }),
      patch: operation({
        tag: 'Groups',
        summary: 'Rename the group',
        path: ['GroupId'],
        body: {
          schema: {
            type: 'object',
            required: ['name'],
            properties: { name: { type: 'string', example: 'Goa Trip 2026' } },
          },
        },
        data: { type: 'object', properties: { group: ref('Group') } },
        errors: [403, 404],
      }),
    },
    '/api/v1/groups/{groupId}/members': {
      post: operation({
        tag: 'Groups',
        summary: 'Add a member by email',
        path: ['GroupId'],
        status: 201,
        body: {
          schema: {
            type: 'object',
            required: ['email'],
            properties: { email: { type: 'string', example: 'rahul@example.com' } },
          },
        },
        data: { type: 'object', properties: { group: ref('Group') } },
        errors: [403, 404, 409],
      }),
    },
    '/api/v1/groups/{groupId}/members/{userId}': {
      delete: operation({
        tag: 'Groups',
        summary: 'Remove a member (only if their balance is 0)',
        path: ['GroupId', 'MemberUserId'],
        data: { type: 'object', properties: { group: ref('Group') } },
        errors: [403, 404, 409],
      }),
    },
    '/api/v1/groups/{groupId}/expenses': {
      post: operation({
        tag: 'Expenses',
        summary: 'Add an expense (EQUAL, EXACT or PERCENT split)',
        path: ['GroupId'],
        status: 201,
        body: { schema: ref('CreateExpense'), examples: expenseBodyExamples },
        data: { type: 'object', properties: { expense: ref('Expense') } },
        errors: [403, 404],
      }),
      get: operation({
        tag: 'Expenses',
        summary: 'List expenses (search, filters, sort, pagination)',
        path: ['GroupId'],
        query: [
          ...paginationQuery(['expenseDate', 'amount', 'createdAt', 'description'], 'expenseDate'),
          queryParam('search', { type: 'string' }, 'Full-text search on description'),
          queryParam('paidBy', objectId),
          queryParam(
            'from',
            { type: 'string', example: '2026-10-01' },
            'Inclusive, YYYY-MM-DD in your timezone',
          ),
          queryParam(
            'to',
            { type: 'string', example: '2026-10-31' },
            'Inclusive, YYYY-MM-DD in your timezone',
          ),
        ],
        data: paginated('Expense'),
        errors: [403, 404],
      }),
    },
    '/api/v1/groups/{groupId}/expenses/{expenseId}': {
      get: operation({
        tag: 'Expenses',
        summary: 'One expense with its splits',
        path: ['GroupId', 'ExpenseId'],
        data: { type: 'object', properties: { expense: ref('Expense') } },
        errors: [403, 404],
      }),
      patch: operation({
        tag: 'Expenses',
        summary: 'Edit an expense (splits re-validated)',
        description:
          'Any subset of fields. Changing only `amount` re-splits EQUAL / PERCENT expenses automatically; EXACT expenses need new `splits`.',
        path: ['GroupId', 'ExpenseId'],
        body: {
          schema: ref('CreateExpense'),
          examples: {
            rename: { description: 'Dinner at Thalassa' },
            amount: { amount: 150000 },
            resplit: expenseBodyExamples.exact,
          },
        },
        data: { type: 'object', properties: { expense: ref('Expense') } },
        errors: [403, 404],
      }),
      delete: operation({
        tag: 'Expenses',
        summary: 'Soft delete an expense',
        path: ['GroupId', 'ExpenseId'],
        errors: [403, 404],
      }),
    },
    '/api/v1/groups/{groupId}/balances': {
      get: operation({
        tag: 'Balances',
        summary: 'Net balance per member (Redis cache; stale = recalculation queued)',
        path: ['GroupId'],
        data: {
          type: 'object',
          properties: {
            groupId: objectId,
            balances: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  userId: objectId,
                  name: { type: 'string' },
                  net: { type: 'integer', example: 50000 },
                },
              },
            },
            isSettled: { type: 'boolean' },
            stale: { type: 'boolean' },
          },
        },
        errors: [403, 404],
      }),
    },
    '/api/v1/groups/{groupId}/settle-plan': {
      get: operation({
        tag: 'Balances',
        summary: 'Fewest payments to settle the group (computed in a worker thread)',
        path: ['GroupId'],
        data: {
          type: 'object',
          properties: {
            payments: {
              type: 'array',
              items: {
                type: 'object',
                properties: { from: objectId, to: objectId, amount: { type: 'integer', example: 30000 } },
              },
            },
            stale: { type: 'boolean' },
          },
        },
        errors: [403, 404],
      }),
    },
    '/api/v1/balances/me': {
      get: operation({
        tag: 'Balances',
        summary: 'My totals across all groups',
        data: {
          type: 'object',
          properties: {
            youOwe: { type: 'integer', example: 120000 },
            youAreOwed: { type: 'integer', example: 45000 },
            net: { type: 'integer', example: -75000 },
            summary: {
              type: 'object',
              properties: {
                youOwe: { type: 'string', example: '₹1,200.00' },
                youAreOwed: { type: 'string', example: '₹450.00' },
              },
            },
          },
        },
      }),
    },
    '/api/v1/groups/{groupId}/settlements': {
      post: operation({
        tag: 'Settlements',
        summary: 'Record a payment between two members',
        path: ['GroupId'],
        status: 201,
        body: {
          schema: {
            type: 'object',
            required: ['toUserId', 'amount'],
            properties: {
              fromUserId: { ...objectId, description: 'Defaults to the caller' },
              toUserId: { ...objectId, example: '66f1c0ffee00000000000002' },
              amount: { ...paise, example: 50000 },
              note: { type: 'string', example: 'UPI' },
            },
          },
        },
        data: { type: 'object', properties: { settlement: ref('Settlement') } },
        errors: [403, 404],
      }),
      get: operation({
        tag: 'Settlements',
        summary: 'Settlement history',
        path: ['GroupId'],
        query: [
          ...paginationQuery(['createdAt', 'amount'], 'createdAt'),
          queryParam('userId', objectId, 'Only settlements involving this user'),
        ],
        data: paginated('Settlement'),
        errors: [403, 404],
      }),
    },
    '/api/v1/activity': {
      get: operation({
        tag: 'Activity',
        summary: 'My activity feed, newest first',
        query: [...paginationQuery(['createdAt'], 'createdAt'), queryParam('groupId', objectId)],
        data: paginated('Activity'),
      }),
    },
    '/api/v1/groups/{groupId}/exports': {
      post: operation({
        tag: 'Exports',
        summary: 'Request a CSV export of the group history (202)',
        path: ['GroupId'],
        status: 202,
        data: ref('ExportStatus'),
        errors: [403, 404, 503],
      }),
    },
    '/api/v1/exports/{exportId}': {
      get: operation({
        tag: 'Exports',
        summary: 'Poll export status and progress',
        path: ['ExportId'],
        data: ref('ExportStatus'),
        errors: [403, 404],
      }),
    },
    '/api/v1/exports/{exportId}/download': {
      get: operation({
        tag: 'Exports',
        summary: 'Download the CSV (404 until DONE)',
        path: ['ExportId'],
        produces: 'text/csv',
        errors: [403, 404],
      }),
    },
  },
};

/**
 * Builds postman/SplitEase.postman_collection.json from the OpenAPI spec (npm run postman:generate).
 * Test scripts capture tokens and created ids into collection variables, so the requests
 * run top to bottom (register -> group -> expense -> balances -> export ...).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { openApiDocument } from '../src/config/swagger';

type Json = Record<string, unknown>;

interface PostmanItem {
  name: string;
  event?: Json[];
  request: Json;
}

const PATH_VARIABLES: Record<string, string> = {
  groupId: 'groupId',
  expenseId: 'expenseId',
  userId: 'memberUserId',
  exportId: 'exportId',
};

const HTTP_METHODS = ['get', 'post', 'patch', 'put', 'delete'] as const;

const QUERY_VARIABLES: Record<string, string> = {
  groupId: '{{groupId}}',
  email: '{{memberEmail}}',
};

const MEMBER_PATH = '/api/v1/groups/{groupId}/members/{userId}';
const LOGIN_PATH = '/api/v1/auth/login';
const LOGOUT_PATH = '/api/v1/auth/logout';
const LOGOUT_ALL_PATH = '/api/v1/auth/logout-all';

/** Kept in a last folder so running the collection top to bottom does not end the session early. */
const CLEANUP_FOLDER = 'Cleanup';
const CLEANUP_PATHS = new Set([MEMBER_PATH, LOGOUT_PATH, LOGOUT_ALL_PATH]);

/** The export is processed in the background; give it a moment before downloading. */
const DOWNLOAD_PRE_REQUEST = ['setTimeout(() => {}, 1500);'];

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function resolveRef(node: unknown): unknown {
  if (!isObject(node) || typeof node.$ref !== 'string') return node;
  const segments = node.$ref.replace(/^#\//, '').split('/');
  let current: unknown = openApiDocument;
  for (const segment of segments) current = isObject(current) ? current[segment] : undefined;
  return resolveRef(current);
}

function exampleFor(schemaNode: unknown): unknown {
  const schema = resolveRef(schemaNode);
  if (!isObject(schema)) return null;
  if (schema.example !== undefined) return schema.example;
  if (Array.isArray(schema.enum)) return schema.enum[0];
  if (isObject(schema.properties)) {
    const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
    return Object.fromEntries(
      Object.entries(schema.properties)
        .filter(([key]) => required.length === 0 || required.includes(key))
        .map(([key, value]) => [key, exampleFor(value)]),
    );
  }
  if (schema.type === 'array') return [exampleFor(schema.items)];
  if (schema.type === 'integer' || schema.type === 'number') return 0;
  if (schema.type === 'boolean') return false;
  return '';
}

function requestBody(operation: Json): { examples: [string, unknown][] } | null {
  const content = isObject(operation.requestBody)
    ? (operation.requestBody.content as Json | undefined)
    : undefined;
  const json = content && isObject(content['application/json']) ? content['application/json'] : null;
  if (!json) return null;
  if (isObject(json.examples)) {
    return {
      examples: Object.entries(json.examples).map(([name, example]) => [
        name,
        isObject(example) ? example.value : example,
      ]),
    };
  }
  return { examples: [['default', exampleFor(json.schema)]] };
}

function queryParams(operation: Json): Json[] {
  const parameters = Array.isArray(operation.parameters) ? operation.parameters : [];
  return parameters
    .map(resolveRef)
    .filter((p): p is Json => isObject(p) && p.in === 'query')
    .map((p) => {
      const example = exampleFor(p.schema);
      const schema = resolveRef(p.schema);
      const fallback = isObject(schema) && schema.default !== undefined ? schema.default : example;
      return {
        key: String(p.name),
        value: QUERY_VARIABLES[String(p.name)] ?? String(fallback ?? ''),
        description: typeof p.description === 'string' ? p.description : undefined,
        disabled: p.required !== true,
      };
    });
}

function usesDeviceHeaders(operation: Json): boolean {
  const parameters = Array.isArray(operation.parameters) ? operation.parameters : [];
  return parameters.some((p) => isObject(p) && p.$ref === '#/components/parameters/DeviceId');
}

function authMode(operation: Json): 'bearer' | 'refresh' | 'none' {
  const security = Array.isArray(operation.security) ? operation.security : [];
  if (security.some((s) => isObject(s) && 'bearerAuth' in s)) return 'bearer';
  if (security.some((s) => isObject(s) && 'refreshToken' in s)) return 'refresh';
  return 'none';
}

function testScript(apiPath: string, method: string): string[] {
  const lines = [
    "const access = pm.response.headers.get('x-access-token');",
    "const refresh = pm.response.headers.get('x-refresh-token');",
    "if (access) pm.collectionVariables.set('accessToken', access);",
    "if (refresh) pm.collectionVariables.set('refreshToken', refresh);",
    apiPath === MEMBER_PATH && method === 'delete'
      ? "pm.test('removed, or 409 while their balance is not settled', () => pm.expect(pm.response.code).to.be.oneOf([200, 409]));"
      : "pm.test('status is 2xx', () => pm.expect(pm.response.code).to.be.within(200, 299));",
  ];
  if (method === 'get' && apiPath.endsWith('/download')) return lines;
  // `data` is a Postman sandbox global (iteration data), so it cannot be redeclared here.
  lines.push(
    'let envelope = {};',
    'try { envelope = pm.response.json(); } catch (e) {}',
    'const payload = envelope.data || {};',
  );
  if (apiPath === '/api/v1/groups' && method === 'post')
    lines.push("if (payload.group) pm.collectionVariables.set('groupId', payload.group.id);");
  if (apiPath === '/api/v1/groups/{groupId}/expenses' && method === 'post')
    lines.push("if (payload.expense) pm.collectionVariables.set('expenseId', payload.expense.id);");
  if (apiPath === '/api/v1/groups/{groupId}/exports')
    lines.push("if (payload.exportId) pm.collectionVariables.set('exportId', payload.exportId);");
  if (apiPath === '/api/v1/users/search')
    lines.push("if (payload.user) pm.collectionVariables.set('memberUserId', payload.user.id);");
  if (apiPath === '/api/v1/auth/register' || apiPath === '/api/v1/auth/login')
    lines.push("if (payload.user) pm.collectionVariables.set('myUserId', payload.user.id);");
  return lines;
}

function buildItem(apiPath: string, method: string, operation: Json, bodyName?: string, body?: unknown) {
  const postmanPath = apiPath.replace(/\{(\w+)\}/g, (_match, name: string) => {
    return `{{${PATH_VARIABLES[name] ?? name}}}`;
  });
  const headers: Json[] = [];
  if (usesDeviceHeaders(operation)) {
    headers.push(
      { key: 'device_id', value: '{{deviceId}}' },
      { key: 'device_type', value: '{{deviceType}}' },
      { key: 'timezone', value: '{{timezone}}' },
      { key: 'lang', value: '{{lang}}' },
    );
  }
  const mode = authMode(operation);
  if (mode === 'refresh') headers.push({ key: 'x-refresh-token', value: '{{refreshToken}}' });
  if (body !== undefined) headers.push({ key: 'Content-Type', value: 'application/json' });

  const query = queryParams(operation);
  const summary = typeof operation.summary === 'string' ? operation.summary : apiPath;
  const item: PostmanItem = {
    name: bodyName && bodyName !== 'default' ? `${summary} (${bodyName})` : summary,
    event: [
      ...(apiPath.endsWith('/download')
        ? [{ listen: 'prerequest', script: { type: 'text/javascript', exec: DOWNLOAD_PRE_REQUEST } }]
        : []),
      { listen: 'test', script: { type: 'text/javascript', exec: testScript(apiPath, method) } },
    ],
    request: {
      method: method.toUpperCase(),
      header: headers,
      auth: mode === 'bearer' ? undefined : { type: 'noauth' },
      url: {
        raw: `{{baseUrl}}${postmanPath}`,
        host: ['{{baseUrl}}'],
        path: postmanPath.split('/').filter(Boolean),
        ...(query.length > 0 ? { query } : {}),
      },
      ...(body !== undefined
        ? {
            body: { mode: 'raw', raw: JSON.stringify(body, null, 2), options: { raw: { language: 'json' } } },
          }
        : {}),
      description: typeof operation.description === 'string' ? operation.description : undefined,
    },
  };
  return item;
}

function withVariables(body: unknown): unknown {
  const raw = JSON.stringify(body)
    .replaceAll('66f1c0ffee00000000000001', '{{myUserId}}')
    .replaceAll('66f1c0ffee00000000000002', '{{memberUserId}}')
    .replaceAll('aman@example.com', '{{email}}')
    .replaceAll('Secret@123', '{{password}}')
    .replaceAll('rahul@example.com', '{{memberEmail}}');
  return JSON.parse(raw) as unknown;
}

function buildCollection(): Json {
  const folders = new Map<string, PostmanItem[]>();
  const byPath = new Map<string, PostmanItem>();
  const paths = openApiDocument.paths as Record<string, Json>;

  for (const [apiPath, pathItem] of Object.entries(paths)) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!isObject(operation)) continue;
      const body = requestBody(operation);
      const items = body
        ? body.examples.map(([name, example]) =>
            buildItem(
              apiPath,
              method,
              operation,
              body.examples.length > 1 ? name : undefined,
              withVariables(example),
            ),
          )
        : [buildItem(apiPath, method, operation)];
      const [first] = items;
      if (first) byPath.set(apiPath, first);
      if (CLEANUP_PATHS.has(apiPath)) continue;
      const tag = Array.isArray(operation.tags) ? String(operation.tags[0]) : 'Other';
      folders.set(tag, [...(folders.get(tag) ?? []), ...items]);
    }
  }

  // Remove member -> log out -> log back in -> log out everywhere.
  const login = byPath.get(LOGIN_PATH);
  const cleanup = [
    byPath.get(MEMBER_PATH),
    byPath.get(LOGOUT_PATH),
    login ? { ...login, name: 'Log in again' } : undefined,
    byPath.get(LOGOUT_ALL_PATH),
  ].filter((item): item is PostmanItem => item !== undefined);
  folders.set(CLEANUP_FOLDER, cleanup);

  const info = openApiDocument.info as Json;
  return {
    info: {
      name: 'SplitEase API',
      description: info.description,
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{accessToken}}', type: 'string' }] },
    variable: [
      { key: 'baseUrl', value: 'http://localhost:3000' },
      { key: 'deviceId', value: 'postman-device-1' },
      { key: 'deviceType', value: '3' },
      { key: 'timezone', value: 'Asia/Kolkata' },
      { key: 'lang', value: 'en' },
      { key: 'email', value: 'aman@example.com' },
      { key: 'password', value: 'Secret@123' },
      { key: 'memberEmail', value: 'rahul@example.com' },
      { key: 'accessToken', value: '' },
      { key: 'refreshToken', value: '' },
      { key: 'myUserId', value: '' },
      { key: 'memberUserId', value: '' },
      { key: 'groupId', value: '' },
      { key: 'expenseId', value: '' },
      { key: 'exportId', value: '' },
    ],
    item: [...folders.entries()].map(([name, item]) => ({ name, item })),
  };
}

const outputDir = path.resolve(__dirname, '..', 'postman');
mkdirSync(outputDir, { recursive: true });
const outputFile = path.join(outputDir, 'SplitEase.postman_collection.json');
writeFileSync(outputFile, `${JSON.stringify(buildCollection(), null, 2)}\n`);
console.log(`Postman collection written to ${path.relative(process.cwd(), outputFile)}`);

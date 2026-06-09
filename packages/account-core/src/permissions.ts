export const SHARED_ACCOUNT_PERMISSIONS = [
  "accounts:connect",
  "accounts:list",
  "accounts:read_metadata",
  "accounts:test",
  "accounts:revoke",
  "accounts:sync",
  "accounts:audit:read"
] as const;

export const SOCIAL_PERMISSIONS = [
  "social:profile:read",
  "social:post:draft",
  "social:post:publish",
  "social:post:delete",
  "social:media:upload",
  "social:mentions:read",
  "social:comments:read",
  "social:dm:read",
  "social:dm:send",
  "social:analytics:read"
] as const;

export const EMAIL_PERMISSIONS = [
  "email:headers:read",
  "email:body:read",
  "email:attachments:read",
  "email:search",
  "email:draft",
  "email:send",
  "email:reply",
  "email:forward",
  "email:archive",
  "email:labels:modify",
  "email:delete",
  "email:sync"
] as const;

export const ACCOUNT_PERMISSIONS = [...SHARED_ACCOUNT_PERMISSIONS, ...SOCIAL_PERMISSIONS, ...EMAIL_PERMISSIONS] as const;

export const POLICY_GATED_PERMISSIONS = [
  "social:post:publish",
  "social:post:delete",
  "social:dm:read",
  "social:dm:send",
  "email:attachments:read",
  "email:send",
  "email:delete"
] as const;

export type LogicSrcAccountPermission = (typeof ACCOUNT_PERMISSIONS)[number];

export function accountPermissionList() {
  return [...ACCOUNT_PERMISSIONS];
}

export function isPolicyGatedPermission(permission: string) {
  return (POLICY_GATED_PERMISSIONS as readonly string[]).includes(permission);
}

export type LogicSrcAccountKind = "social" | "email";

export type LogicSrcAccountStatus = "connected" | "expired" | "revoked" | "error" | "disabled" | "pending";

export type LogicSrcAccountAuthMethod = "oauth2" | "api_key" | "imap_smtp" | "local_bridge";

export type LogicSrcPrincipalType = "user" | "agent" | "workflow" | "plugin";

export type LogicSrcPolicyMode =
  | "allow"
  | "approval_required"
  | "deny"
  | "allow_if_dry_run"
  | "allow_if_trusted_agent"
  | "allow_if_below_risk_score";

export type LogicSrcPolicyDecision = "allow" | "approval_required" | "deny";

export type LogicSrcRiskBand = "low" | "medium" | "high" | "critical";

export interface LogicSrcConnectedAccount {
  id: string;
  orgId?: string;
  projectId?: string;
  boardId?: string;
  ownerUserId: string;
  kind: LogicSrcAccountKind;
  provider: string;
  providerAccountId?: string;
  displayName: string;
  handle?: string;
  email?: string;
  avatarUrl?: string;
  homepageUrl?: string;
  status: LogicSrcAccountStatus;
  scopes: string[];
  capabilities: string[];
  credentialRef: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  lastSyncedAt?: string;
}

export interface LogicSrcAccountProviderManifest {
  id: string;
  name: string;
  kind: LogicSrcAccountKind;
  authMethods: LogicSrcAccountAuthMethod[];
  capabilities: string[];
  defaultScopes?: string[];
  status?: "available" | "planned" | "disabled";
  docsUrl?: string;
}

export interface LogicSrcAccountProvider extends LogicSrcAccountProviderManifest {
  getAuthUrl?(input: AuthUrlInput): Promise<AuthUrlResult>;
  completeAuth?(input: CompleteAuthInput): Promise<ConnectedAccountResult>;
  refreshCredential?(input: RefreshCredentialInput): Promise<CredentialRefreshResult>;
  testConnection(input: TestConnectionInput): Promise<TestConnectionResult>;
  revoke?(input: RevokeAccountInput): Promise<RevokeAccountResult>;
}

export interface SocialAccountProvider extends LogicSrcAccountProvider {
  kind: "social";
  getProfile(input: SocialAccountInput): Promise<SocialProfile>;
  draftPost(input: DraftSocialPostInput): Promise<SocialDraft>;
  publishPost(input: PublishSocialPostInput): Promise<PublishedSocialPost>;
  uploadMedia?(input: UploadSocialMediaInput): Promise<UploadedMedia>;
  searchMentions?(input: SearchMentionsInput): Promise<SocialMention[]>;
  listComments?(input: ListCommentsInput): Promise<SocialComment[]>;
  getAnalytics?(input: SocialAnalyticsInput): Promise<SocialAnalyticsResult>;
}

export interface EmailAccountProvider extends LogicSrcAccountProvider {
  kind: "email";
  searchMessages(input: EmailSearchInput): Promise<EmailSearchResult>;
  readMessage(input: ReadEmailMessageInput): Promise<EmailMessage>;
  draftMessage(input: DraftEmailInput): Promise<EmailDraft>;
  sendMessage(input: SendEmailInput): Promise<SentEmailResult>;
  replyToMessage?(input: ReplyEmailInput): Promise<SentEmailResult>;
  forwardMessage?(input: ForwardEmailInput): Promise<SentEmailResult>;
  archiveMessage?(input: EmailMessageMutationInput): Promise<EmailMutationResult>;
  applyLabels?(input: EmailLabelInput): Promise<EmailMutationResult>;
  deleteMessage?(input: EmailMessageMutationInput): Promise<EmailMutationResult>;
}

export interface AuthUrlInput {
  redirectUri: string;
  state: string;
  scopes: string[];
  metadata?: Record<string, unknown>;
}

export interface AuthUrlResult {
  url: string;
  state: string;
  expiresAt?: string;
}

export interface CompleteAuthInput {
  code: string;
  redirectUri: string;
  state: string;
  principal: LogicSrcPrincipal;
}

export interface ConnectedAccountResult {
  account: LogicSrcConnectedAccount;
  auditEvent: LogicSrcAccountAuditEvent;
}

export interface RefreshCredentialInput {
  account: LogicSrcConnectedAccount;
  broker: LogicSrcCredentialBroker;
}

export interface CredentialRefreshResult {
  credentialRef: string;
  scopes: string[];
  expiresAt?: string;
}

export interface TestConnectionInput {
  account: LogicSrcConnectedAccount;
  broker: LogicSrcCredentialBroker;
}

export interface TestConnectionResult {
  ok: boolean;
  provider: string;
  checkedAt: string;
  message?: string;
}

export interface RevokeAccountInput {
  account: LogicSrcConnectedAccount;
  broker: LogicSrcCredentialBroker;
  principal: LogicSrcPrincipal;
}

export interface RevokeAccountResult {
  ok: boolean;
  revokedAt: string;
}

export interface LogicSrcPrincipal {
  type: LogicSrcPrincipalType;
  id: string;
  trusted?: boolean;
}

export interface LogicSrcAccountPermissionGrant {
  id: string;
  accountId: string;
  principal: LogicSrcPrincipal;
  permissions: string[];
  policy: LogicSrcAccountPolicy[];
  expiresAt?: string;
  createdBy?: string;
  createdAt: string;
  revokedAt?: string;
}

export interface LogicSrcAccountPolicy {
  id: string;
  resource: string;
  action: string;
  default: LogicSrcPolicyMode;
  conditions?: Record<string, unknown>;
}

export interface LogicSrcPolicyEvaluationInput {
  action: string;
  grant?: LogicSrcAccountPermissionGrant;
  riskScore?: number;
  dryRun?: boolean;
  principal?: LogicSrcPrincipal;
}

export interface LogicSrcPolicyEvaluationResult {
  decision: LogicSrcPolicyDecision;
  riskScore: number;
  reason: string;
}

export interface LogicSrcCredentialBroker {
  getCredential(input: CredentialBrokerGetInput): Promise<CredentialBrokerGetResult>;
  storeCredential(input: CredentialBrokerStoreInput): Promise<CredentialBrokerStoreResult>;
  revokeCredential(input: CredentialBrokerRevokeInput): Promise<CredentialBrokerRevokeResult>;
}

export interface CredentialBrokerGetInput {
  credentialRef: string;
  accountId: string;
  provider: string;
  purpose: string;
  principal: LogicSrcPrincipal;
}

export interface CredentialBrokerGetResult {
  credentialRef: string;
  token: string;
  expiresAt?: string;
}

export interface CredentialBrokerStoreInput {
  provider: string;
  kind: LogicSrcAccountKind;
  scopes: string[];
  secret: string;
  metadata?: Record<string, unknown>;
}

export interface CredentialBrokerStoreResult {
  credentialRef: string;
}

export interface CredentialBrokerRevokeInput {
  credentialRef: string;
  accountId: string;
  provider: string;
  principal: LogicSrcPrincipal;
}

export interface CredentialBrokerRevokeResult {
  ok: boolean;
  revokedAt: string;
}

export interface LogicSrcAccountAuditEvent {
  id: string;
  accountId?: string;
  provider: string;
  kind: LogicSrcAccountKind;
  principal: LogicSrcPrincipal;
  action: string;
  decision: LogicSrcPolicyDecision;
  riskScore: number;
  requestPreview: Record<string, unknown>;
  resultPreview: Record<string, unknown>;
  correlationId?: string;
  createdAt: string;
}

export interface SocialAccountInput {
  account: LogicSrcConnectedAccount;
  broker: LogicSrcCredentialBroker;
}

export interface SocialProfile {
  providerAccountId: string;
  displayName: string;
  handle?: string;
  avatarUrl?: string;
  homepageUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface DraftSocialPostInput extends SocialAccountInput {
  text: string;
  media?: SocialMediaInput[];
  principal: LogicSrcPrincipal;
}

export interface PublishSocialPostInput extends DraftSocialPostInput {
  dryRun?: boolean;
  approvalId?: string;
}

export interface SocialDraft {
  id: string;
  accountId: string;
  text: string;
  media: SocialMediaInput[];
  createdAt: string;
}

export interface PublishedSocialPost {
  providerPostId?: string;
  url?: string;
  publishedAt: string;
  dryRun?: boolean;
}

export interface SocialMediaInput {
  url?: string;
  fileRef?: string;
  altText?: string;
  mimeType?: string;
}

export interface UploadSocialMediaInput extends SocialAccountInput {
  media: SocialMediaInput;
}

export interface UploadedMedia {
  providerMediaId: string;
  url?: string;
}

export interface SearchMentionsInput extends SocialAccountInput {
  query?: string;
  limit?: number;
}

export interface SocialMention {
  id: string;
  text: string;
  authorHandle?: string;
  url?: string;
  createdAt?: string;
}

export interface ListCommentsInput extends SocialAccountInput {
  postId: string;
  limit?: number;
}

export interface SocialComment extends SocialMention {
  postId: string;
}

export interface SocialAnalyticsInput extends SocialAccountInput {
  postId?: string;
  since?: string;
  until?: string;
}

export interface SocialAnalyticsResult {
  metrics: Record<string, number>;
  metadata?: Record<string, unknown>;
}

export interface EmailSearchInput {
  account: LogicSrcConnectedAccount;
  broker: LogicSrcCredentialBroker;
  query: string;
  limit?: number;
  headersOnly?: boolean;
  principal: LogicSrcPrincipal;
}

export interface EmailSearchResult {
  messages: EmailMessageMetadata[];
  nextPageToken?: string;
}

export interface EmailMessageMetadata {
  id: string;
  providerMessageId: string;
  threadId?: string;
  subject?: string;
  fromAddress?: string;
  toAddresses: string[];
  ccAddresses: string[];
  snippet?: string;
  labels: string[];
  hasAttachments: boolean;
  receivedAt?: string;
  sentAt?: string;
}

export interface ReadEmailMessageInput {
  account: LogicSrcConnectedAccount;
  broker: LogicSrcCredentialBroker;
  messageId: string;
  includeBody?: boolean;
  includeAttachments?: boolean;
  principal: LogicSrcPrincipal;
}

export interface EmailMessage extends EmailMessageMetadata {
  bodyText?: string;
  bodyHtml?: string;
  attachments?: EmailAttachment[];
}

export interface EmailAttachment {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes?: number;
  contentRef?: string;
}

export interface DraftEmailInput {
  account: LogicSrcConnectedAccount;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
  attachmentRefs?: string[];
  principal: LogicSrcPrincipal;
}

export interface EmailDraft {
  id: string;
  accountId: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  bodyPreview: string;
  attachmentRefs: string[];
  createdAt: string;
}

export interface SendEmailInput extends DraftEmailInput {
  draftId?: string;
  dryRun?: boolean;
  approvalId?: string;
}

export interface SentEmailResult {
  providerMessageId?: string;
  sentAt: string;
  dryRun?: boolean;
}

export interface ReplyEmailInput extends SendEmailInput {
  messageId: string;
}

export interface ForwardEmailInput extends SendEmailInput {
  messageId: string;
}

export interface EmailMessageMutationInput {
  account: LogicSrcConnectedAccount;
  broker: LogicSrcCredentialBroker;
  messageId: string;
  principal: LogicSrcPrincipal;
}

export interface EmailLabelInput extends EmailMessageMutationInput {
  add?: string[];
  remove?: string[];
}

export interface EmailMutationResult {
  ok: boolean;
  messageId: string;
  changedAt: string;
}

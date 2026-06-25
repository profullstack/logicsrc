/**
 * Optional c0mpute.com backend — run agent/judge/router inference on
 * community-shared GPUs instead of (or alongside) a hosted provider.
 *
 * The host app connects a user's c0mpute.com account via the c0mpute OAuth
 * connector and obtains an API key + inference base URL; this module turns that
 * into a LangChain chat model (c0mpute exposes an OpenAI-compatible endpoint).
 * agentswarm itself performs no OAuth — it only consumes the resolved credentials.
 */

export const C0MPUTE_DEFAULT_BASE_URL = "https://api.c0mpute.com/v1";
export const C0MPUTE_DEFAULT_MODEL = "default";

/** Result of a user connecting their c0mpute.com account. */
export interface C0mputeConnector {
  /** API key issued after the user OAuths/connects their c0mpute.com account. */
  apiKey: string;
  /** OpenAI-compatible inference base URL. Defaults to the c0mpute public endpoint. */
  baseUrl?: string;
  /** Model id to request from the worker pool. */
  model?: string;
}

export interface ResolvedC0mputeConnector {
  apiKey: string;
  baseUrl: string;
  model: string;
}

/** Apply defaults and validate a connector; throws if it has not been connected. */
export function resolveC0mputeConnector(connector: C0mputeConnector): ResolvedC0mputeConnector {
  if (!connector.apiKey) {
    throw new Error("c0mpute connector requires an apiKey — connect a c0mpute.com account first");
  }
  return {
    apiKey: connector.apiKey,
    baseUrl: connector.baseUrl ?? C0MPUTE_DEFAULT_BASE_URL,
    model: connector.model ?? C0MPUTE_DEFAULT_MODEL
  };
}

/** Build a connector from env vars (shares names with the c0mpute plugin). */
export function c0mputeConnectorFromEnv(
  env: Record<string, string | undefined> = process.env
): C0mputeConnector {
  return {
    apiKey: env.C0MPUTE_API_KEY ?? "",
    baseUrl: env.C0MPUTE_API_URL,
    model: env.C0MPUTE_MODEL
  };
}

/** Indirection so TS does not statically resolve the optional `@langchain/openai` peer. */
async function loadOptionalModule(specifier: string): Promise<any> {
  return import(specifier);
}

/**
 * Build a LangChain chat model pointed at c0mpute.com. Pass the result as the
 * `model` of {@link createDeepAgentRunner}, or as the `chatModel` of
 * `createLLMJudge` / `createLLMRouter`, to run that inference on c0mpute GPUs.
 *
 * Optional peer: requires `@langchain/openai` in the host app.
 */
export async function createC0mputeModel(connector: C0mputeConnector): Promise<any> {
  const resolved = resolveC0mputeConnector(connector);
  let openai: any;
  try {
    openai = await loadOptionalModule("@langchain/openai");
  } catch {
    throw new Error("createC0mputeModel requires '@langchain/openai'. Install it: npm i @langchain/openai");
  }
  return new openai.ChatOpenAI({
    apiKey: resolved.apiKey,
    model: resolved.model,
    configuration: { baseURL: resolved.baseUrl }
  });
}

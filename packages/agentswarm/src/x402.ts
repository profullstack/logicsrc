/**
 * x402 billing wrapper — gate a swarm route behind payment. Wraps the Web
 * handler so unpaid requests get a standard HTTP 402 challenge (the x402
 * "accepts" shape) and paid requests fall through to the agent. The actual
 * payment verification is injectable so a host wires it to CoinPay/x402.
 */

export interface X402Accept {
  scheme: string;
  network: string;
  asset: string;
  /** Price in the asset's minor units. */
  amount: number;
  /** Address / CoinPay account that receives payment. */
  payTo?: string;
}

export interface X402Options {
  /** Returns true when the request carries valid payment/authorization. */
  verify: (request: Request) => boolean | Promise<boolean>;
  /** Payment options advertised in the 402 challenge. */
  accepts?: X402Accept[];
  /** Fully custom 402 response; overrides `accepts`. */
  challenge?: (request: Request) => Response | Promise<Response>;
}

const CORS_ORIGIN = { "access-control-allow-origin": "*" };

/**
 * Wrap a `(Request) => Response` swarm handler so each call must be paid for.
 * CORS preflights pass through untouched; everything else must satisfy `verify`
 * or receives a 402 with the advertised payment options.
 */
export function withX402(
  handler: (request: Request) => Promise<Response>,
  options: X402Options
): (request: Request) => Promise<Response> {
  return async function paid(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") {
      return handler(request);
    }
    if (await options.verify(request)) {
      return handler(request);
    }
    if (options.challenge) {
      return options.challenge(request);
    }
    return new Response(
      JSON.stringify({
        x402Version: 1,
        error: "payment_required",
        accepts: options.accepts ?? []
      }),
      { status: 402, headers: { "content-type": "application/json", ...CORS_ORIGIN } }
    );
  };
}

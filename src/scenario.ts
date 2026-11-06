import type { BridgeRequest, BridgeResponse } from "@ifsoul/adapter-sdk";
/** Original game-owned synthetic dialogue; no model or factual recall. */
export function exampleScenarioResponse(
  request: BridgeRequest,
): BridgeResponse {
  return {
    choiceId: request.fallbackChoiceId,
    source: "scenario",
    speech:
      request.language === "ru"
        ? "Держись рядом. Мы вместе найдём дорогу."
        : "Stay close. We’ll find our way through together.",
  };
}

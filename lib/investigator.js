const diagnosisSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "cause", "effect", "firstAbnormalEventId", "evidence", "nextStep"],
  properties: {
    summary: { type: "string" },
    cause: { type: "string" },
    effect: { type: "string" },
    firstAbnormalEventId: { type: "string" },
    evidence: {
      type: "array",
      minItems: 2,
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["eventId", "claim"],
        properties: {
          eventId: { type: "string" },
          claim: { type: "string" }
        }
      }
    },
    nextStep: { type: "string" }
  }
};

function cleanText(value, maximumLength = 260) {
  return typeof value === "string" ? value.trim().slice(0, maximumLength) : "";
}

export function sanitizeTrace(trace) {
  if (!trace || !Array.isArray(trace.events) || trace.events.length === 0 || trace.events.length > 50) {
    throw new Error("A trace with 1 to 50 events is required.");
  }

  return {
    id: cleanText(trace.id, 80),
    status: trace.status === "error" ? "error" : "success",
    fault: cleanText(trace.fault, 80) || null,
    duration: Number.isFinite(trace.duration) ? Math.max(0, trace.duration) : 0,
    events: trace.events.map((event, index) => ({
      id: cleanText(event.id, 80) || `event-${index + 1}`,
      at: Number.isFinite(event.at) ? Math.max(0, event.at) : 0,
      node: cleanText(event.node, 40),
      kind: cleanText(event.kind, 40),
      level: event.level === "error" ? "error" : "info",
      title: cleanText(event.title, 120),
      detail: cleanText(event.detail, 260)
    }))
  };
}

export function buildFallbackDiagnosis(trace) {
  const sanitizedTrace = sanitizeTrace(trace);
  const firstError = sanitizedTrace.events.find((event) => event.level === "error");
  const apiError = sanitizedTrace.events.find(
    (event) => event.level === "error" && event.node === "api"
  );
  const browserError = sanitizedTrace.events.find(
    (event) => event.level === "error" && event.node === "browser"
  );

  if (!firstError) {
    return {
      summary: "The action completed without an abnormal trace event.",
      cause: "No failing boundary appeared in this trace.",
      effect: "The browser received a successful result.",
      firstAbnormalEventId: sanitizedTrace.events.at(-1).id,
      evidence: [
        {
          eventId: sanitizedTrace.events.at(-1).id,
          claim: "The final event completed without an error level."
        }
      ],
      nextStep: "Turn on Fault Lab and save again to compare a controlled failure.",
      mode: "local"
    };
  }

  if (sanitizedTrace.fault === "reject_database_write") {
    return {
      summary: "The injected database fault rejected the save.",
      cause: "Fault Lab stopped the database write before a record was inserted.",
      effect: "The API returned an error, so the browser kept the unsaved finding in the form.",
      firstAbnormalEventId: firstError.id,
      evidence: [
        {
          eventId: firstError.id,
          claim: "This is the first error and the point where the write was rejected."
        },
        ...(apiError
          ? [{ eventId: apiError.id, claim: "The API returned an error after the rejected write." }]
          : []),
        ...(browserError
          ? [{ eventId: browserError.id, claim: "The browser showed the failed save without clearing the form." }]
          : [])
      ],
      nextStep: "Turn off Fault Lab and retry. The same path should finish with a database commit.",
      mode: "local"
    };
  }

  const firstErrorIndex = sanitizedTrace.events.indexOf(firstError);
  const precedingEvent = sanitizedTrace.events[firstErrorIndex - 1];
  const followingError = sanitizedTrace.events.slice(firstErrorIndex + 1)
    .find((event) => event.level === "error");
  const boundary = firstError.node || "an unnamed boundary";
  return {
    summary: `The first recorded error appeared at ${boundary}.`,
    cause: firstError.title || "The trace recorded an error without a more specific safe description.",
    effect: followingError
      ? `A later error also appeared at ${followingError.node || "another boundary"}.`
      : "No later error was recorded in the supplied trace.",
    firstAbnormalEventId: firstError.id,
    evidence: [
      {
        eventId: firstError.id,
        claim: "This is the first event marked as an error in the trace."
      },
      ...(precedingEvent
        ? [{ eventId: precedingEvent.id, claim: "This is the last recorded event before the error." }]
        : []),
      ...(followingError
        ? [{ eventId: followingError.id, claim: "This later error shows the recorded downstream effect." }]
        : [])
    ],
    nextStep: `Inspect ${boundary} and reproduce the action while watching the same boundary.`,
    mode: "local"
  };
}

export function validateDiagnosis(candidate, trace) {
  const sanitizedTrace = sanitizeTrace(trace);
  const eventIds = new Set(sanitizedTrace.events.map((event) => event.id));

  if (!candidate || typeof candidate !== "object") return null;

  const summary = cleanText(candidate.summary);
  const cause = cleanText(candidate.cause);
  const effect = cleanText(candidate.effect);
  const firstAbnormalEventId = cleanText(candidate.firstAbnormalEventId, 80);
  const nextStep = cleanText(candidate.nextStep);
  const submittedEvidence = Array.isArray(candidate.evidence)
    ? candidate.evidence.slice(0, 4).map((item) => ({
        eventId: cleanText(item?.eventId, 80),
        claim: cleanText(item?.claim)
      }))
    : [];
  const evidenceIsValid = submittedEvidence.every(
    (item) => eventIds.has(item.eventId) && item.claim
  );

  if (
    !summary ||
    !cause ||
    !effect ||
    !nextStep ||
    !eventIds.has(firstAbnormalEventId) ||
    submittedEvidence.length < 2 ||
    !evidenceIsValid
  ) {
    return null;
  }

  return {
    summary,
    cause,
    effect,
    firstAbnormalEventId,
    evidence: submittedEvidence,
    nextStep,
    mode: "ai"
  };
}

function extractResponseText(responseBody) {
  if (typeof responseBody.output_text === "string") return responseBody.output_text;

  for (const item of responseBody.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === "string") return content.text;
    }
  }

  return "";
}

export async function investigateTrace(trace, options = {}) {
  const sanitizedTrace = sanitizeTrace(trace);
  const apiKey = options.apiKey || process.env.OPENAI_API_KEY;
  const model = options.model || process.env.OPENAI_MODEL;
  const baseUrl = options.baseUrl || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const fetchImplementation = options.fetchImplementation || fetch;

  if (!apiKey || !model) return buildFallbackDiagnosis(sanitizedTrace);

  try {
    const response = await fetchImplementation(`${baseUrl.replace(/\/$/, "")}/responses`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model,
        instructions:
          "Diagnose only from the supplied sanitized trace. Find the first abnormal event. Keep each field short. Cite only event IDs present in the trace. Do not invent code, logs, or causes.",
        input: JSON.stringify(sanitizedTrace),
        text: {
          format: {
            type: "json_schema",
            name: "trace_diagnosis",
            strict: true,
            schema: diagnosisSchema
          }
        }
      }),
      signal: AbortSignal.timeout(8000)
    });

    if (!response.ok) throw new Error(`Investigator request failed with ${response.status}.`);

    const responseBody = await response.json();
    const parsedDiagnosis = JSON.parse(extractResponseText(responseBody));
    return validateDiagnosis(parsedDiagnosis, sanitizedTrace) || buildFallbackDiagnosis(sanitizedTrace);
  } catch {
    return buildFallbackDiagnosis(sanitizedTrace);
  }
}

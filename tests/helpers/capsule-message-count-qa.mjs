import { expect } from "@playwright/test";

export const QA_ENV = process.env.QA_ENV || "staging";
export const API_BASE_URL = process.env.API_BASE_URL;
export const TEST_CAPSULE_SLUG = process.env.TEST_CAPSULE_SLUG || "sabujak-qa";
export const TEST_ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || "0000";
export const ENABLE_MESSAGE_COUNT_SSE_QA =
  process.env.ENABLE_MESSAGE_COUNT_SSE_QA === "true";
export const ENABLE_LIVE_COUNT_UI_E2E =
  process.env.ENABLE_LIVE_COUNT_UI_E2E === "true";
export const CAPSULE_DETAIL_PATH_TEMPLATE =
  process.env.CAPSULE_DETAIL_PATH_TEMPLATE || "/capsules/{slug}";
export const MESSAGE_COUNT_SELECTOR = process.env.MESSAGE_COUNT_SELECTOR;

export const isMock = QA_ENV === "mock";

export function apiUrl(pathname) {
  return new URL(pathname, API_BASE_URL).toString();
}

export function buildUniqueSlug(label) {
  return `${TEST_CAPSULE_SLUG}-${label}-${Date.now()}`;
}

export function buildQaNickname(label = "qa") {
  return `${label}-${Date.now().toString(36)}`.slice(0, 20);
}

export function isoAfterDays(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

export function buildCapsuleDetailPath(slug) {
  return CAPSULE_DETAIL_PATH_TEMPLATE.replaceAll("{slug}", slug);
}

export async function extractJson(response) {
  const contentType = response.headers()["content-type"] || "";

  if (!contentType.includes("application/json")) {
    return null;
  }

  return response.json();
}

export async function createQaCapsule(
  request,
  {
    slug,
    title = "QA capsule",
    password = TEST_ADMIN_PASSWORD,
    openAt = isoAfterDays(3),
  },
) {
  const reservationResponse = await request.post(apiUrl("/capsules/slug-reservations"), {
    data: { slug },
  });

  expect(reservationResponse.status()).toBe(201);

  const reservation = await reservationResponse.json();
  const createResponse = await request.post(apiUrl("/capsules"), {
    data: {
      slug,
      title,
      password,
      openAt,
      reservationToken: reservation.reservationToken,
      reservationSessionToken: reservation.reservationSessionToken,
    },
  });

  expect(createResponse.status()).toBe(201);

  return createResponse.json();
}

export async function cleanupCapsule(request, { slug, password = TEST_ADMIN_PASSWORD }) {
  const response = await request.delete(apiUrl(`/capsules/${slug}`), {
    data: { password },
  });

  if (response.status() === 204 || response.status() === 404) {
    return;
  }

  const payload = await extractJson(response);
  throw new Error(
    `Failed to cleanup capsule "${slug}". status=${response.status()} payload=${JSON.stringify(payload)}`,
  );
}

export async function getCapsuleDetail(request, slug) {
  const response = await request.get(apiUrl(`/capsules/${slug}`));
  const payload = await response.json();

  expect(response.status()).toBe(200);
  return payload;
}

export async function createQaMessage(
  request,
  { slug, nickname = buildQaNickname("msg"), content = "Sabujak QA message" },
) {
  const response = await request.post(apiUrl(`/capsules/${slug}/messages`), {
    data: {
      nickname,
      content,
    },
  });

  const payload = await response.json();
  expect(response.status()).toBe(201);
  return payload;
}

export async function openMessageCountStream(slug) {
  const abortController = new AbortController();
  const response = await fetch(apiUrl(`/capsules/${slug}/message-count/stream`), {
    headers: {
      Accept: "text/event-stream",
    },
    signal: abortController.signal,
  });

  if (!response.ok || !response.body) {
    throw new Error(`Failed to open SSE stream. status=${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  async function close() {
    abortController.abort();

    try {
      await reader.cancel();
    } catch {
      // ignore close-time cancellation noise
    }
  }

  async function nextEvent(timeoutMs = 10_000) {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const separatorIndex = buffer.indexOf("\n\n");

      if (separatorIndex >= 0) {
        const rawEvent = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);

        const parsed = parseSseEvent(rawEvent);

        if (parsed) {
          return parsed;
        }

        continue;
      }

      const remainingMs = deadline - Date.now();
      const result = await Promise.race([
        reader.read(),
        new Promise((resolve) =>
          setTimeout(() => resolve({ timeout: true }), remainingMs),
        ),
      ]);

      if (result?.timeout) {
        throw new Error(`Timed out waiting for SSE event after ${timeoutMs}ms.`);
      }

      if (result.done) {
        throw new Error("SSE stream closed before the next event arrived.");
      }

      buffer += decoder.decode(result.value, { stream: true }).replaceAll("\r", "");
    }

    throw new Error(`Timed out waiting for SSE event after ${timeoutMs}ms.`);
  }

  return {
    close,
    nextEvent,
    response,
  };
}

function parseSseEvent(rawEvent) {
  const lines = rawEvent.split("\n");
  let event = "message";
  const dataLines = [];

  for (const line of lines) {
    if (!line || line.startsWith(":")) {
      continue;
    }

    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
      continue;
    }

    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trim());
    }
  }

  if (dataLines.length === 0) {
    return null;
  }

  return {
    data: JSON.parse(dataLines.join("\n")),
    event,
  };
}

export async function installEventSourceRecorder(page) {
  await page.addInitScript(() => {
    window.__qaEventSourceUrls = [];
    window.__qaMessageCountEvents = [];

    const OriginalEventSource = window.EventSource;

    window.EventSource = class QaEventSource extends OriginalEventSource {
      constructor(url, configuration) {
        super(url, configuration);
        window.__qaEventSourceUrls.push(String(url));

        this.addEventListener("messageCount", (event) => {
          try {
            window.__qaMessageCountEvents.push(JSON.parse(event.data));
          } catch {
            window.__qaMessageCountEvents.push({ raw: event.data });
          }
        });
      }
    };
  });
}

export async function getRecordedMessageCountEvents(page) {
  return page.evaluate(() => window.__qaMessageCountEvents ?? []);
}

export async function getRecordedEventSourceUrls(page) {
  return page.evaluate(() => window.__qaEventSourceUrls ?? []);
}

export async function openCapsuleDetailPage(page, slug) {
  const response = await page.goto(buildCapsuleDetailPath(slug), {
    waitUntil: "domcontentloaded",
  });

  expect(response).not.toBeNull();
  return response;
}

export async function readMessageCountFromPage(page) {
  const candidates = [];

  if (MESSAGE_COUNT_SELECTOR) {
    candidates.push(page.locator(MESSAGE_COUNT_SELECTOR).first());
  }

  candidates.push(page.locator('[data-testid="capsule-message-count"]').first());
  candidates.push(page.locator(".total-heart").first());
  candidates.push(page.getByText(/개의 따뜻한 마음이 모였어요/).first());

  let text = "";

  for (const locator of candidates) {
    if ((await locator.count()) === 0) {
      continue;
    }

    text = (await locator.textContent()) || "";

    if (text.trim()) {
      break;
    }
  }

  const matched = text.match(/\d+/);

  if (!matched) {
    throw new Error(
      `Could not parse message count. selector="${MESSAGE_COUNT_SELECTOR || "(auto)"}" text="${text}"`,
    );
  }

  return Number(matched[0]);
}

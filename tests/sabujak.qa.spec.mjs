import { test, expect } from "@playwright/test";

const QA_ENV = process.env.QA_ENV || "staging";
const APP_BASE_URL = process.env.APP_BASE_URL;
const API_BASE_URL = process.env.API_BASE_URL;
const TEST_CAPSULE_SLUG = process.env.TEST_CAPSULE_SLUG || "sabujak-qa";
const TEST_ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || "0000";

const isMock = QA_ENV === "mock";
const uniqueSuffix = `${Date.now()}`;
const workingSlug = isMock ? TEST_CAPSULE_SLUG : `${TEST_CAPSULE_SLUG}-${uniqueSuffix}`;

function apiUrl(pathname) {
  return new URL(pathname, API_BASE_URL).toString();
}

function isoAfterDays(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function addDays(isoString, days) {
  return new Date(Date.parse(isoString) + days * 24 * 60 * 60 * 1000).toISOString();
}

async function extractJson(response) {
  const contentType = response.headers()["content-type"] || "";
  if (!contentType.includes("application/json")) {
    return null;
  }
  return response.json();
}

test.describe("Sabujak time capsule QA", () => {
  test.beforeAll(async ({ request }) => {
    if (isMock) {
      return;
    }

    const reservationResponse = await request.post(apiUrl("/capsules/slug-reservations"), {
      data: { slug: workingSlug },
    });
    const reservation = await reservationResponse.json();
    const openAt = isoAfterDays(3);

    expect(reservationResponse.status()).toBe(201);

    const createResponse = await request.post(apiUrl("/capsules"), {
      data: {
        slug: workingSlug,
        title: "QA capsule",
        password: TEST_ADMIN_PASSWORD,
        openAt,
        reservationToken: reservation.reservationToken,
      },
    });

    expect(createResponse.status()).toBe(201);
  });

  test("app entry is reachable", async ({ page }) => {
    const response = await page.goto(APP_BASE_URL, { waitUntil: "domcontentloaded" });

    expect(response).not.toBeNull();
    expect(response.ok()).toBeTruthy();
  });

  test("slug reservation returns reservationToken", async ({ request }) => {
    const response = await request.post(apiUrl("/capsules/slug-reservations"), {
      data: { slug: workingSlug },
    });
    const payload = await response.json();

    expect(response.status()).toBe(201);
    expect(payload.slug).toBe(workingSlug);
    expect(payload.reservationToken).toBeTruthy();
    expect(payload.reservedUntil).toBeTruthy();
  });

  test("capsule creation follows reservationToken flow", async ({ request }) => {
    if (!isMock) {
      test.skip(true, "real/staging 환경에서는 beforeAll에서 캡슐을 생성한다");
    }

    const reservationResponse = await request.post(apiUrl("/capsules/slug-reservations"), {
      data: { slug: workingSlug },
    });
    const reservation = await reservationResponse.json();
    const openAt = isoAfterDays(3);

    const createResponse = await request.post(apiUrl("/capsules"), {
      data: {
        slug: workingSlug,
        title: "QA capsule",
        password: TEST_ADMIN_PASSWORD,
        openAt,
        reservationToken: reservation.reservationToken,
      },
    });
    const created = await createResponse.json();

    expect(createResponse.status()).toBe(201);
    expect(created.slug).toBe(workingSlug);
    expect(created.title).toBe("QA capsule");
    expect(created.openAt).toBe(openAt);
    expect(created.expiresAt).toBeTruthy();
  });

  test("capsule lookup branches before and after opening", async ({ request }) => {
    const closedSlug = isMock ? "qa-mock-closed" : workingSlug;
    const closedResponse = await request.get(apiUrl(`/capsules/${closedSlug}`));
    const closedCapsule = await closedResponse.json();

    expect(closedResponse.status()).toBe(200);
    expect(closedCapsule.slug).toBe(closedSlug);

    if (isMock) {
      expect(closedCapsule.isOpen).toBeFalsy();
      expect(closedCapsule.messages).toBeUndefined();
    } else {
      expect(closedCapsule.isOpen).toBeFalsy();
      expect(closedCapsule.messages).toBeUndefined();
    }

    const openedSlug = isMock ? "opened-capsule" : workingSlug;
    const openedResponse = await request.get(apiUrl(`/capsules/${openedSlug}`));
    const openedCapsule = await openedResponse.json();

    expect(openedResponse.status()).toBe(200);
    if (isMock) {
      expect(openedCapsule.isOpen).toBeTruthy();
      expect(Array.isArray(openedCapsule.messages)).toBeTruthy();
    } else {
      expect(openedCapsule.isOpen).toBeFalsy();
      expect(openedCapsule.messages).toBeUndefined();
    }
  });

  test("message creation works and duplicate nickname rule is environment-aware", async ({ request }) => {
    const nickname = `qa-nick-${uniqueSuffix}`;
    const firstMessage = await request.post(apiUrl(`/capsules/${workingSlug}/messages`), {
      data: {
        nickname,
        content: "Sabujak QA message",
      },
    });
    const firstPayload = await firstMessage.json();

    expect(firstMessage.status()).toBe(201);
    expect(firstPayload.nickname).toBe(nickname);
    expect(firstPayload.content).toBe("Sabujak QA message");

    const duplicateMessage = await request.post(apiUrl(`/capsules/${workingSlug}/messages`), {
      data: {
        nickname,
        content: "duplicate nickname should fail in real",
      },
    });

    if (isMock) {
      expect(duplicateMessage.status()).toBe(201);
      test.info().annotations.push({
        type: "mock-gap",
        description: "mock 환경은 duplicate nickname 차단을 아직 구현하지 않음",
      });
      return;
    }

    const duplicatePayload = await extractJson(duplicateMessage);

    expect(duplicateMessage.status()).toBe(409);
    expect(duplicatePayload?.error?.code).toBe("DUPLICATE_NICKNAME");
  });

  test("admin password checks and openAt update rules are environment-aware", async ({ request }) => {
    const wrongPassword = "9999";

    const verifyResponse = await request.post(apiUrl(`/capsules/${workingSlug}/verify`), {
      data: { password: wrongPassword },
    });

    if (isMock) {
      const verifyPayload = await verifyResponse.json();
      expect(verifyResponse.status()).toBe(200);
      expect(verifyPayload.verified).toBeTruthy();
      test.info().annotations.push({
        type: "mock-gap",
        description: "mock 환경은 관리자 비밀번호 검증을 강제하지 않음",
      });
      return;
    }

    const verifyPayload = await extractJson(verifyResponse);
    expect(verifyResponse.status()).toBe(403);
    expect(verifyPayload?.error?.code).toBe("FORBIDDEN_PASSWORD");

    const newOpenAt = isoAfterDays(10);
    const updateResponse = await request.patch(apiUrl(`/capsules/${workingSlug}`), {
      data: {
        password: TEST_ADMIN_PASSWORD,
        title: "QA capsule updated",
        openAt: newOpenAt,
      },
    });
    const updatedCapsule = await updateResponse.json();

    expect(updateResponse.status()).toBe(200);
    expect(updatedCapsule.openAt).toBe(newOpenAt);
    expect(updatedCapsule.expiresAt).toBe(addDays(newOpenAt, 7));

    const deleteResponse = await request.delete(apiUrl(`/capsules/${workingSlug}`), {
      data: {
        password: TEST_ADMIN_PASSWORD,
      },
    });

    expect(deleteResponse.status()).toBe(204);
  });
});

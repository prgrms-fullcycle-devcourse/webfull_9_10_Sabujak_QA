import { test, expect } from "@playwright/test";
import {
  ENABLE_LIVE_COUNT_UI_E2E,
  ENABLE_MESSAGE_COUNT_SSE_QA,
  buildUniqueSlug,
  cleanupCapsule,
  createQaCapsule,
  createQaMessage,
  deleteQaMessage,
  getCapsuleDetail,
  getRecordedEventSourceUrls,
  getRecordedMessageCountEvents,
  installEventSourceRecorder,
  isMock,
  openCapsuleDetailPage,
  openMessageCountStream,
  readMessageCountFromPage,
} from "./helpers/capsule-message-count-qa.mjs";

test.describe.serial("Capsule messageCount SSE QA", () => {
  test.skip(isMock, "mock 환경은 messageCount SSE 및 메시지 삭제 API를 아직 제공하지 않는다.");
  test.skip(
    !ENABLE_MESSAGE_COUNT_SSE_QA,
    "ENABLE_MESSAGE_COUNT_SSE_QA=true 일 때만 신규 SSE QA를 실행한다.",
  );

  const streamSlug = buildUniqueSlug("sse-api");
  const uiSlug = buildUniqueSlug("sse-ui");

  test.beforeAll(async ({ request }) => {
    await createQaCapsule(request, { slug: streamSlug, title: "QA SSE API capsule" });
    await createQaCapsule(request, { slug: uiSlug, title: "QA SSE UI capsule" });
  });

  test.afterAll(async ({ request }) => {
    await cleanupCapsule(request, { slug: streamSlug });
    await cleanupCapsule(request, { slug: uiSlug });
  });

  test("API: initial detail count and initial SSE snapshot stay aligned", async ({ request }) => {
    const detail = await getCapsuleDetail(request, streamSlug);
    const stream = await openMessageCountStream(streamSlug);

    try {
      expect(stream.response.headers.get("content-type")).toContain("text/event-stream");

      const initialEvent = await stream.nextEvent();

      expect(initialEvent.event).toBe("messageCount");
      expect(initialEvent.data).toEqual({
        messageCount: detail.messageCount,
      });
    } finally {
      await stream.close();
    }
  });

  test("Scenario A API: creating a message pushes incremented count", async ({ request }) => {
    const beforeDetail = await getCapsuleDetail(request, streamSlug);
    const stream = await openMessageCountStream(streamSlug);

    try {
      const initialEvent = await stream.nextEvent();
      expect(initialEvent.data.messageCount).toBe(beforeDetail.messageCount);

      await createQaMessage(request, {
        content: "messageCount should go up",
        nickname: `qa-create-${Date.now()}`,
        slug: streamSlug,
      });

      const updatedEvent = await stream.nextEvent();
      const refreshedDetail = await getCapsuleDetail(request, streamSlug);

      expect(updatedEvent.event).toBe("messageCount");
      expect(updatedEvent.data.messageCount).toBe(beforeDetail.messageCount + 1);
      expect(refreshedDetail.messageCount).toBe(updatedEvent.data.messageCount);
    } finally {
      await stream.close();
    }
  });

  test("Scenario B API: deleting a message pushes decremented count", async ({ request }) => {
    const createdMessage = await createQaMessage(request, {
      content: "messageCount should go down",
      nickname: `qa-delete-${Date.now()}`,
      slug: streamSlug,
    });
    const beforeDetail = await getCapsuleDetail(request, streamSlug);
    const stream = await openMessageCountStream(streamSlug);

    try {
      const initialEvent = await stream.nextEvent();
      expect(initialEvent.data.messageCount).toBe(beforeDetail.messageCount);

      await deleteQaMessage(request, {
        messageId: createdMessage.id,
        slug: streamSlug,
      });

      const updatedEvent = await stream.nextEvent();
      const refreshedDetail = await getCapsuleDetail(request, streamSlug);

      expect(updatedEvent.event).toBe("messageCount");
      expect(updatedEvent.data.messageCount).toBe(beforeDetail.messageCount - 1);
      expect(refreshedDetail.messageCount).toBe(updatedEvent.data.messageCount);
    } finally {
      await stream.close();
    }
  });

  test.describe("UI live update scenarios", () => {
    test.skip(
      !ENABLE_LIVE_COUNT_UI_E2E,
      "ENABLE_LIVE_COUNT_UI_E2E=true 일 때만 브라우저 상세 페이지 시나리오를 실행한다.",
    );

    test("Scenario A UI: page A shows incremented count without refresh when another flow creates a message", async ({
      page,
      request,
    }) => {
      const detailRequests = [];
      const sseRequests = [];
      const pageErrors = [];

      page.on("request", (nextRequest) => {
        const { pathname } = new URL(nextRequest.url());
        const method = nextRequest.method();
        const resourceType = nextRequest.resourceType();

        if (
          method === "GET" &&
          (resourceType === "fetch" || resourceType === "xhr") &&
          pathname === `/capsules/${uiSlug}`
        ) {
          detailRequests.push(nextRequest.url());
        }

        if (
          method === "GET" &&
          resourceType === "eventsource" &&
          pathname === `/capsules/${uiSlug}/message-count/stream`
        ) {
          sseRequests.push(nextRequest.url());
        }
      });
      page.on("pageerror", (error) => {
        pageErrors.push(error.message);
      });

      await installEventSourceRecorder(page);

      const initialDetail = await getCapsuleDetail(request, uiSlug);

      await openCapsuleDetailPage(page, uiSlug);
      await expect.poll(() => readMessageCountFromPage(page)).toBe(initialDetail.messageCount);
      await expect
        .poll(async () => (await getRecordedMessageCountEvents(page)).length)
        .toBeGreaterThan(0);

      await createQaMessage(request, {
        content: "ui count should go up",
        nickname: `qa-ui-create-${Date.now()}`,
        slug: uiSlug,
      });

      await expect.poll(() => readMessageCountFromPage(page)).toBe(initialDetail.messageCount + 1);

      const recordedUrls = await getRecordedEventSourceUrls(page);
      const recordedEvents = await getRecordedMessageCountEvents(page);

      expect(detailRequests).toHaveLength(1);
      expect(sseRequests.length).toBeGreaterThan(0);
      expect(
        recordedUrls.some((url) => url.includes(`/capsules/${uiSlug}/message-count/stream`)),
      ).toBeTruthy();
      expect(recordedEvents.at(-1)?.messageCount).toBe(initialDetail.messageCount + 1);
      expect(pageErrors).toEqual([]);
    });

    test("Scenario B UI: page A shows decremented count without refresh when a message is deleted", async ({
      page,
      request,
    }) => {
      const pageErrors = [];
      const createdMessage = await createQaMessage(request, {
        content: "ui delete target",
        nickname: `qa-ui-delete-${Date.now()}`,
        slug: uiSlug,
      });
      const initialDetail = await getCapsuleDetail(request, uiSlug);

      page.on("pageerror", (error) => {
        pageErrors.push(error.message);
      });

      await installEventSourceRecorder(page);
      await openCapsuleDetailPage(page, uiSlug);
      await expect.poll(() => readMessageCountFromPage(page)).toBe(initialDetail.messageCount);

      await deleteQaMessage(request, {
        messageId: createdMessage.id,
        slug: uiSlug,
      });

      await expect.poll(() => readMessageCountFromPage(page)).toBe(initialDetail.messageCount - 1);

      const recordedEvents = await getRecordedMessageCountEvents(page);

      expect(recordedEvents.at(-1)?.messageCount).toBe(initialDetail.messageCount - 1);
      expect(pageErrors).toEqual([]);
    });
  });
});

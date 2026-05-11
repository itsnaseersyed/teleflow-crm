import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { getFirebaseAdminServices } from "./lib/firebase-admin";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function handleDeleteTelecaller(request: Request, env: unknown): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) {
    return jsonResponse({ error: "Missing authorization token" }, 401);
  }

  let payload: { uid?: string };
  try {
    payload = (await request.json()) as { uid?: string };
  } catch {
    return jsonResponse({ error: "Invalid request body" }, 400);
  }

  if (!payload.uid) {
    return jsonResponse({ error: "Missing telecaller uid" }, 400);
  }

  try {
    const { auth, firestore } = getFirebaseAdminServices(env);
    const decoded = await auth.verifyIdToken(token);
    const requesterSnap = await firestore.collection("users").doc(decoded.uid).get();
    const requester = requesterSnap.data();

    if (!requesterSnap.exists || requester?.role !== "admin") {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    const targetRef = firestore.collection("users").doc(payload.uid);
    const targetSnap = await targetRef.get();

    if (!targetSnap.exists) {
      return jsonResponse({ error: "Telecaller profile not found" }, 404);
    }

    const target = targetSnap.data();
    if (target?.role !== "telecaller") {
      return jsonResponse({ error: "Only telecaller accounts can be deleted from this action" }, 400);
    }

    try {
      await auth.deleteUser(payload.uid);
    } catch (error: any) {
      if (error?.code !== "auth/user-not-found") {
        throw error;
      }
    }

    await targetRef.update({
      isActive: false,
      password: null,
      deletedAt: new Date(),
      deletedBy: decoded.uid,
      deletedByName: requester?.fullName || requester?.email || null,
    });

    return jsonResponse({ success: true });
  } catch (error: any) {
    console.error("Failed to delete telecaller:", error);
    return jsonResponse({ error: error?.message || "Failed to delete telecaller" }, 500);
  }
}

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m as { default?: ServerEntry }).default ?? (m as unknown as ServerEntry),
    );
  }
  return serverEntryPromise;
}

function brandedErrorResponse(): Response {
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isCatastrophicSsrErrorBody(body: string, responseStatus: number): boolean {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return false;
  }

  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    return false;
  }

  const fields = payload as Record<string, unknown>;
  const expectedKeys = new Set(["message", "status", "unhandled"]);
  if (!Object.keys(fields).every((key) => expectedKeys.has(key))) {
    return false;
  }

  return (
    fields.unhandled === true &&
    fields.message === "HTTPError" &&
    (fields.status === undefined || fields.status === responseStatus)
  );
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isCatastrophicSsrErrorBody(body, response.status)) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return brandedErrorResponse();
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const url = new URL(request.url);
    if (url.pathname === "/api/admin/delete-telecaller") {
      return handleDeleteTelecaller(request, env);
    }

    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return brandedErrorResponse();
    }
  },
};

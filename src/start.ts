import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware],
}));



// Client bootstrap: dynamically import client-only modules and mount the router.
if (typeof window !== "undefined") {
  (async () => {
    try {
      const [{ createRoot }, { RouterProvider }, routerModule] = await Promise.all([
        import("react-dom/client"),
        import("@tanstack/react-router"),
        import("./router"),
      ]);

      const router = routerModule.getRouter();
      const el = document.getElementById("app");
      console.log("[start.ts] imports resolved");
      if (!el) return;
      createRoot(el).render(
        // Use plain createElement to avoid depending on JSX transform here
        // but RouterProvider is a React component so JSX is fine too.
        // We'll use JSX for clarity.
        /*#__PURE__*/ (await import("react")).createElement(RouterProvider, { router }),
      );
      console.log("[start.ts] app mounted");
    } catch (err) {
      console.error("[start.ts] client mount failed", err);
    }
  })();
}

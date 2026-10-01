function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api/signature/verify") {
      return json({
        status: "client_side_ready",
        message: "PDF Digital Signature Verification & Ready-to-Print processing runs client-side in the browser for maximum speed, security, and privacy."
      });
    }
    return env.ASSETS.fetch(request);
  }
};

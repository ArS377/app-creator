async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: options.body
      ? { "content-type": "application/json", ...options.headers }
      : options.headers
  });
  if (response.status === 204) return null;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || "The request could not be completed.");
    error.status = response.status;
    error.code = body.code;
    throw error;
  }
  return body;
}

export const api = {
  get(path) {
    return request(path);
  },
  post(path, body = {}) {
    return request(path, { method: "POST", body: JSON.stringify(body) });
  },
  delete(path) {
    return request(path, { method: "DELETE" });
  }
};

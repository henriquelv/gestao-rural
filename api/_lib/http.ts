export interface ApiRequest {
  method?: string;
  query: Record<string, string | string[] | undefined>;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

export interface ApiResponse {
  status(code: number): ApiResponse;
  setHeader(name: string, value: string): void;
  json(body: unknown): void;
}

export const headerValue = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? value[0] || '' : value || '';

export const queryValue = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? value[0] || '' : value || '';

export const sendJson = (res: ApiResponse, status: number, body: unknown): void => {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.status(status).json(body);
};

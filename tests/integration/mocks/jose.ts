export type JWTPayload = Record<string, unknown> & {
  sub?: string;
  roles?: unknown;
  jti?: string;
};

export function createRemoteJWKSet(_url: URL): () => Promise<null> {
  return async () => null;
}

export async function jwtVerify(
  _token: string,
  _keyResolver: unknown,
  _options?: unknown
): Promise<{ payload: JWTPayload }> {
  return {
    payload: {
      sub: 'test-account',
      roles: ['teacher'],
      jti: 'test-jti'
    }
  };
}

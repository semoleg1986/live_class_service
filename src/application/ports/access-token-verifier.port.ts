export type AccessTokenClaims = {
  accountId: string;
  roles: string[];
  tokenId: string | null;
};

export interface AccessTokenVerifierPort {
  verifyAccessToken(token: string): Promise<AccessTokenClaims>;
}

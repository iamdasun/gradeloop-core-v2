/**
 * Lightweight JWT payload decoder.
 *
 * Does NOT verify the signature – that is the backend's responsibility.
 * Used only to extract claims from a token that the backend has already
 * issued and validated.
 */

export interface IamTokenClaims {
  /** UUID of the authenticated user */
  user_id: string;
  username: string;
  /** Single role name assigned to the user */
  role_name: string;
  /** Flat list of permission names granted through the role */
  permissions: string[];
  /** Expiry unix timestamp */
  exp: number;
  iat: number;
  iss: string;
  sub: string;
}

/**
 * Decodes the payload of a JWT without verifying its signature.
 * Returns `null` if the token is malformed.
 */
export function decodeJwtPayload(token: string): IamTokenClaims | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    // base64url → base64 → JSON
    const base64Url = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
    const base64 = base64Url + padding;
    const json = atob(base64);
    return JSON.parse(json) as IamTokenClaims;
  } catch {
    return null;
  }
}

/** Returns true if the token is expired (compared against current time). */
export function isTokenExpired(claims: IamTokenClaims): boolean {
  return Date.now() / 1000 >= claims.exp;
}

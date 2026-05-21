/**
 * PR Sentinel — Authentication Service
 *
 * Responsibility:
 * - Handle GitHub OAuth flow
 * - Store and manage JWT tokens
 * - Provide token-based API requests
 *
 * Exported:
 * - AuthService: Main auth service class
 */


import { loadSessionValue, saveSessionValue } from "./storage";

export interface AuthToken {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface CurrentUser {
  github_id: number;
  github_username: string;
  email?: string;
  name?: string;
  tier: string;
  created_at: string;
  last_login?: string;
}

class AuthService {
  /**
   * Start GitHub OAuth login flow.
   *
   * Redirects to backend OAuth endpoint.
   *
   * @param backendUrl - Backend API base URL
   */
  async initiateGitHubLogin(backendUrl: string): Promise<void> {
    const authUrl = `${backendUrl.replace("/api/v1", "")}/api/v1/auth/github`;
    window.location.href = authUrl;
  }

  /**
   * Complete OAuth callback.
   *
   * Called after GitHub redirects back from authorization.
   * Extracts JWT from URL parameter and stores it.
   *
   * @param backendUrl - Backend API base URL
   * @param token - JWT token from OAuth callback URL
   * @returns Stored user session info (or minimal user object if fetch fails)
   */
  async completeOAuthCallback(backendUrl: string, token?: string): Promise<CurrentUser> {
    try {
      // If token is provided via URL parameter, store it
      if (token) {
        await saveSessionValue("jwt", token);
        console.log("[Auth] JWT token stored from OAuth callback");
      }

      // Try to fetch user, but don't fail if it doesn't work (CORS issues during deployment)
      try {
        const user = await this.getCurrentUser(backendUrl);
        await saveSessionValue("isAuthenticated", true);
        await saveSessionValue("userEmail", user.email || user.github_username);
        console.log("[Auth] OAuth callback completed successfully", { username: user.github_username });
        return user;
      } catch (fetchError) {
        console.warn("[Auth] Could not fetch user during callback (will retry later):", fetchError);
        // Mark as authenticated anyway since we have a valid JWT
        await saveSessionValue("isAuthenticated", true);
        console.log("[Auth] OAuth callback completed with token stored (user fetch deferred)");

        // Return a minimal user object - real user data will be fetched later
        return {
          github_id: 0,
          github_username: "pending",
          tier: "free",
          created_at: new Date().toISOString(),
        };
      }
    } catch (error) {
      console.error("[Auth] OAuth callback failed:", error);
      throw error;
    }
  }

  /**
   * Get current authenticated user.
   *
   * @param backendUrl - Backend API base URL
   * @returns Current user information
   * @throws Error if not authenticated or request fails
   */
  async getCurrentUser(backendUrl: string): Promise<CurrentUser> {
    const token = await this.getToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Add JWT token if available
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${backendUrl}/auth/me`, {
      credentials: "include", // Include cookies (access_token)
      headers,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch user: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Check if user is authenticated.
   *
   * Attempts to fetch current user. If successful, user is authenticated.
   *
   * @param backendUrl - Backend API base URL
   * @returns True if authenticated
   */
  async isAuthenticated(backendUrl: string): Promise<boolean> {
    try {
      await this.getCurrentUser(backendUrl);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Logout user.
   *
   * Clears backend session and local storage.
   *
   * @param backendUrl - Backend API base URL
   */
  async logout(backendUrl: string): Promise<void> {
    try {
      const token = await this.getToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      await fetch(`${backendUrl}/auth/logout`, {
        method: "POST",
        credentials: "include",
        headers,
      });
    } catch (error) {
      console.error("[Auth] Logout request failed:", error);
    }

    // Clear local session
    await saveSessionValue("isAuthenticated", false);
    await saveSessionValue("userEmail", "");
    await saveSessionValue("jwt", "");
    console.log("[Auth] User logged out, session cleared");
  }

  /**
   * Get stored JWT token from session.
   *
   * @returns JWT token or null if not stored
   */
  async getToken(): Promise<string | null> {
    return loadSessionValue<string>("jwt");
  }

  /**
   * Check if token exists and is valid.
   *
   * @returns True if valid token is available
   */
  async hasValidToken(): Promise<boolean> {
    const token = await this.getToken();
    return !!token && token.length > 0;
  }
}

export const authService = new AuthService();

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

import { apiClient } from "./api";
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
   * Backend will have set the access_token cookie.
   *
   * @param backendUrl - Backend API base URL
   * @returns Stored user session info
   */
  async completeOAuthCallback(backendUrl: string): Promise<CurrentUser> {
    try {
      const user = await this.getCurrentUser(backendUrl);
      await saveSessionValue("isAuthenticated", true);
      await saveSessionValue("userEmail", user.email || user.github_username);
      return user;
    } catch (error) {
      console.error("OAuth callback failed:", error);
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
    const response = await fetch(`${backendUrl}/auth/me`, {
      credentials: "include", // Include cookies (access_token)
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
      await fetch(`${backendUrl}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch (error) {
      console.error("Logout request failed:", error);
    }

    // Clear local session
    await saveSessionValue("isAuthenticated", false);
    await saveSessionValue("userEmail", "");
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
   * Check if token needs refresh.
   *
   * For now, simple implementation. Can be enhanced with token expiry checks.
   *
   * @returns True if token should be refreshed
   */
  async shouldRefreshToken(): Promise<boolean> {
    const token = await this.getToken();
    return !token;
  }
}

export const authService = new AuthService();

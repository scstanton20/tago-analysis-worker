// In-memory challenge storage for WebAuthn usernameless authentication
// Replaces express-session for storing temporary challenges

class ChallengeStorage {
  constructor() {
    this.challenges = new Map();
    this.cleanupInterval = 5 * 60 * 1000; // Cleanup every 5 minutes
    this.challengeTTL = 5 * 60 * 1000; // Challenges expire after 5 minutes

    // Start cleanup timer
    setInterval(() => this.cleanup(), this.cleanupInterval);
  }

  // Generate a unique challenge ID
  generateChallengeId() {
    return `challenge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Store a challenge with automatic expiration
  store(challengeData) {
    const challengeId = this.generateChallengeId();
    const expiresAt = Date.now() + this.challengeTTL;

    this.challenges.set(challengeId, {
      ...challengeData,
      expiresAt,
      createdAt: Date.now(),
    });

    return challengeId;
  }

  // Retrieve and remove a challenge (one-time use)
  consume(challengeId) {
    const challengeData = this.challenges.get(challengeId);

    if (!challengeData) {
      return null;
    }

    // Check if expired
    if (Date.now() > challengeData.expiresAt) {
      this.challenges.delete(challengeId);
      return null;
    }

    // Remove challenge (one-time use)
    this.challenges.delete(challengeId);

    return challengeData;
  }

  // Clean up expired challenges
  cleanup() {
    const now = Date.now();
    let removedCount = 0;

    for (const [challengeId, challengeData] of this.challenges.entries()) {
      if (now > challengeData.expiresAt) {
        this.challenges.delete(challengeId);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      console.log(`Cleaned up ${removedCount} expired WebAuthn challenges`);
    }
  }

  // Get current stats (for debugging)
  getStats() {
    return {
      totalChallenges: this.challenges.size,
      expiredChallenges: Array.from(this.challenges.values()).filter(
        (c) => Date.now() > c.expiresAt,
      ).length,
    };
  }
}

// Export singleton instance
export const challengeStorage = new ChallengeStorage();

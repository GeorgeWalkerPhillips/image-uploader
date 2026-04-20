class RateLimiter {
  constructor(maxRequests, timeWindowMs) {
    this.maxRequests = maxRequests;
    this.timeWindowMs = timeWindowMs;
    this.requests = [];
  }

  isAllowed() {
    const now = Date.now();
    this.requests = this.requests.filter(
      (timestamp) => now - timestamp < this.timeWindowMs
    );

    if (this.requests.length < this.maxRequests) {
      this.requests.push(now);
      return true;
    }

    return false;
  }

  getRemainingTime() {
    if (this.requests.length === 0) return 0;
    const oldestRequest = this.requests[0];
    const remainingTime = this.timeWindowMs - (Date.now() - oldestRequest);
    return Math.max(0, remainingTime);
  }
}

const uploadsPerMinute = parseInt(
  process.env.REACT_APP_RATE_LIMIT_UPLOADS_PER_MINUTE || '10',
  10
);

export const uploadLimiter = new RateLimiter(uploadsPerMinute, 60000);

export const checkRateLimit = () => {
  if (!uploadLimiter.isAllowed()) {
    const remainingSeconds = Math.ceil(uploadLimiter.getRemainingTime() / 1000);
    throw new Error(
      `Too many uploads. Try again in ${remainingSeconds} seconds.`
    );
  }
};

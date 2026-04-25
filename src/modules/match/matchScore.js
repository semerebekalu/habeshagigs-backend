/**
 * Compute a composite match score for a freelancer against a job.
 * Pure function.
 * @param {object} job - { budget_min, budget_max, skillIds: number[] }
 * @param {object} freelancer - { avg_rating, hourly_rate, avg_response_time_hrs, skillIds: number[] }
 * @returns {number} score 0–100
 */
function computeMatchScore(job, freelancer) {
    // Skill match (0–40)
    const jobSkills = new Set(job.skillIds || []);
    const freelancerSkills = new Set(freelancer.skillIds || []);
    const matched = [...jobSkills].filter(s => freelancerSkills.has(s)).length;
    const skillScore = jobSkills.size > 0 ? (matched / jobSkills.size) * 40 : 20;

    // Rating (0–30): avg_rating is 0–5
    const ratingScore = ((freelancer.avg_rating || 0) / 5) * 30;

    // Price alignment (0–20): closer to budget midpoint = higher score
    const mid = ((job.budget_min || 0) + (job.budget_max || 0)) / 2;
    const rate = freelancer.hourly_rate || 0;
    const priceDiff = mid > 0 ? Math.abs(rate - mid) / mid : 0;
    const priceScore = Math.max(0, 20 - priceDiff * 20);

    // Response time (0–10): lower is better, cap at 48h
    const responseHrs = Math.min(freelancer.avg_response_time_hrs || 48, 48);
    const responseScore = ((48 - responseHrs) / 48) * 10;

    return parseFloat((skillScore + ratingScore + priceScore + responseScore).toFixed(2));
}

module.exports = { computeMatchScore };

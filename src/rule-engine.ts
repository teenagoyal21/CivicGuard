import type { Rule, ContextFactors, RuleMatchResult } from './types.js';
import { getActiveRules, getActiveCrisisMode } from './supabase.js';

const NEW_ACCOUNT_THRESHOLD_DAYS = 7;
const LOW_KARMA_THRESHOLD = 50;
const PRIOR_REMOVALS_THRESHOLD = 3;

export async function computeContextFactors(
  authorId: string | undefined,
  authorName: string | undefined,
  subredditName: string | undefined,
  redditClient: any
): Promise<ContextFactors> {
  let accountAgeDays = 365;
  let karma = 100;
  let priorRemovals = 0;

  if (authorId) {
    try {
      const user = await redditClient.getUserById(authorId);
      if (user) {
        const createdUtc = (user as any).createdUtc ?? (user as any).createdAt ?? Date.now() / 1000;
        const created = new Date(typeof createdUtc === 'number' ? createdUtc * 1000 : createdUtc);
        accountAgeDays = Math.floor((Date.now() - created.getTime()) / (1000 * 60 * 60 * 24));

        try {
          const karmaResp = await redditClient.getUserKarmaFromCurrentSubreddit(user.username);
          karma = (karmaResp.fromPosts ?? 0) + (karmaResp.fromComments ?? 0);
        } catch {
          karma = (user as any).totalKarma ?? 100;
        }
      }
    } catch (e) {
      console.error('Error fetching user info for context:', e);
    }

    if (authorName && subredditName) {
      try {
        const notes = await redditClient.getModNotes({
          subreddit: subredditName,
          user: authorName,
          limit: 20,
        }).all();
        priorRemovals = notes.filter((n: any) => {
          const label = n.userNoteData?.label ?? (n as any).label;
          return label === 'REMOVAL' || label === 'SPAM_WARNING';
        }).length;
      } catch {
        // Not a mod or no notes
      }
    }
  }

  return {
    account_age_days: accountAgeDays,
    karma,
    prior_removals: priorRemovals,
    is_new_account: accountAgeDays < NEW_ACCOUNT_THRESHOLD_DAYS,
    is_low_karma: karma < LOW_KARMA_THRESHOLD,
    has_prior_removals: priorRemovals >= PRIOR_REMOVALS_THRESHOLD,
  };
}

export function adjustScoreWithContext(rawScore: number, factors: ContextFactors, crisisMode: boolean): number {
  let adjustment = 0;

  if (factors.is_new_account) adjustment += 0.1;
  if (factors.is_low_karma) adjustment += 0.05;
  if (factors.has_prior_removals) adjustment += 0.15;
  if (factors.account_age_days > 365 && factors.karma > 1000) adjustment -= 0.1;
  if (crisisMode) adjustment += 0.15;

  return Math.max(0, Math.min(1, rawScore + adjustment));
}

function matchKeywords(text: string, keywords: string[]): string[] {
  const lowerText = text.toLowerCase();
  const matched: string[] = [];
  for (const kw of keywords) {
    const lowerKw = kw.toLowerCase();
    const pattern = new RegExp('\\b' + escapeRegex(lowerKw) + '\\b', 'i');
    if (pattern.test(lowerText)) {
      matched.push(kw);
    }
  }
  return matched;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function computeRawScore(matchedKeywords: string[], totalKeywords: number): number {
  if (totalKeywords === 0) return 0;
  const matchRatio = matchedKeywords.length / totalKeywords;
  return Math.min(1, 0.4 + matchRatio * 0.6);
}

export async function evaluateContent(
  text: string,
  subredditId: string,
  authorId: string | undefined,
  authorName: string | undefined,
  subredditName: string | undefined,
  redditClient: any
): Promise<RuleMatchResult[]> {
  const [rules, crisisModeEntry] = await Promise.all([
    getActiveRules(subredditId),
    getActiveCrisisMode(subredditId),
  ]);

  const crisisMode = crisisModeEntry !== null;
  const factors = await computeContextFactors(authorId, authorName, subredditName, redditClient);
  const results: RuleMatchResult[] = [];

  for (const rule of rules) {
    const matched = matchKeywords(text, rule.keywords);
    if (matched.length === 0) continue;

    const rawScore = computeRawScore(matched, rule.keywords.length);
    const contextAdjustedScore = adjustScoreWithContext(rawScore, factors, crisisMode);
    const effectiveThreshold = crisisMode ? rule.threshold * 0.8 : rule.threshold;

    if (contextAdjustedScore >= effectiveThreshold) {
      results.push({
        rule,
        matched_keywords: matched,
        raw_score: rawScore,
        context_adjusted_score: contextAdjustedScore,
        context_factors: factors,
      });
    }
  }

  results.sort((a, b) => b.context_adjusted_score - a.context_adjusted_score);
  return results;
}

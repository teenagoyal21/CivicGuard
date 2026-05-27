import type { JobContext } from '@devvit/public-api/types/scheduler.js';
import {
  getFlaggedItemCounts,
  getTopFlaggedTerms,
  getCategoryBreakdown,
  getWelfareInjectionCount,
  getCrisisModeActivationCount,
  insertHealthReport,
} from './supabase.js';

export async function generateWeeklyReport(context: JobContext): Promise<void> {
  const subredditId = context.subredditId;
  const subredditName = context.subredditName ?? subredditId;
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 7);
  const since = weekStart.toISOString();
  const weekStartStr = weekStart.toISOString().split('T')[0];

  const [counts, topTerms, categoryBreakdown, welfareCount, crisisCount] = await Promise.all([
    getFlaggedItemCounts(subredditId, since),
    getTopFlaggedTerms(subredditId, since, 10),
    getCategoryBreakdown(subredditId, since),
    getWelfareInjectionCount(subredditId, since),
    getCrisisModeActivationCount(subredditId, since),
  ]);

  await insertHealthReport({
    subreddit_id: subredditId,
    week_start: weekStartStr,
    total_flagged: counts.total ?? 0,
    total_approved: counts.approved ?? 0,
    total_removed: counts.removed ?? 0,
    total_ignored: counts.ignored ?? 0,
    welfare_injections: welfareCount,
    top_flagged_terms: topTerms,
    by_category: categoryBreakdown,
    crisis_mode_activations: crisisCount,
  });

  // Build digest post text
  const reportText = buildDigestPostText(
    weekStartStr,
    counts,
    topTerms,
    categoryBreakdown,
    welfareCount,
    crisisCount
  );

  try {
    await context.reddit.submitPost({
      subredditName,
      title: 'CivicGuard Community Health Report — Week of ' + weekStartStr,
      text: reportText,
    });
  } catch (e) {
    console.error('Error submitting weekly report post:', e);
  }
}

function buildDigestPostText(
  weekStart: string,
  counts: Record<string, number>,
  topTerms: { term: string; count: number }[],
  categories: Record<string, number>,
  welfareCount: number,
  crisisCount: number
): string {
  const lines: string[] = [
    `# CivicGuard Community Health Report`,
    `**Week of ${weekStart}**`,
    '',
    `---`,
    '',
    `## Summary`,
    `| Metric | Count |`,
    `|---|---|`,
    `| Total Flagged | ${counts.total ?? 0} |`,
    `| Approved | ${counts.approved ?? 0} |`,
    `| Removed | ${counts.removed ?? 0} |`,
    `| Ignored | ${counts.ignored ?? 0} |`,
    `| Welfare Resources Injected | ${welfareCount} |`,
    `| Crisis Mode Activations | ${crisisCount} |`,
    '',
  ];

  if (topTerms.length > 0) {
    lines.push('## Top Flagged Terms');
    lines.push('| Term | Count |');
    lines.push('|---|---|');
    for (const t of topTerms) {
      lines.push(`| ${t.term} | ${t.count} |`);
    }
    lines.push('');
  }

  if (Object.keys(categories).length > 0) {
    lines.push('## Flags by Category');
    lines.push('| Category | Count |');
    lines.push('|---|---|');
    for (const [cat, count] of Object.entries(categories)) {
      lines.push(`| ${cat} | ${count} |`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('*This report was generated automatically by CivicGuard. Configure your rules and resources in the app settings.*');

  return lines.join('\n');
}

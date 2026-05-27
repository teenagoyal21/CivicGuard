import { createClient } from '@supabase/supabase-js';
import type { Rule, FlaggedItem, WelfareResource, WelfareInjectionLog, HealthReport, CrisisModeEntry } from './types.js';

declare const process: { env: Record<string, string | undefined> };

const supabaseUrl = process.env.VITE_SUPABASE_URL ?? '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY ?? '';

export const supabase = createClient(supabaseUrl, supabaseKey);

export async function getActiveRules(subredditId: string): Promise<Rule[]> {
  const { data, error } = await supabase
    .from('rules')
    .select('*')
    .eq('subreddit_id', subredditId)
    .eq('is_active', true);
  if (error) {
    console.error('Error fetching rules:', error);
    return [];
  }
  return (data ?? []) as Rule[];
}

export async function insertFlaggedItem(item: Omit<FlaggedItem, 'id' | 'created_at'>): Promise<FlaggedItem | null> {
  const { data, error } = await supabase
    .from('flagged_items')
    .insert(item)
    .select()
    .maybeSingle();
  if (error) {
    console.error('Error inserting flagged item:', error);
    return null;
  }
  return data as FlaggedItem | null;
}

export async function getPendingFlaggedItems(subredditId: string, limit = 25): Promise<FlaggedItem[]> {
  const { data, error } = await supabase
    .from('flagged_items')
    .select('*')
    .eq('subreddit_id', subredditId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('Error fetching flagged items:', error);
    return [];
  }
  return (data ?? []) as FlaggedItem[];
}

export async function updateFlaggedItemStatus(
  id: string,
  status: FlaggedItem['status'],
  modUsername: string
): Promise<boolean> {
  const { error } = await supabase
    .from('flagged_items')
    .update({ status, mod_username: modUsername, resolved_at: new Date().toISOString() })
    .eq('id', id);
  if (error) {
    console.error('Error updating flagged item:', error);
    return false;
  }
  return true;
}

export async function getActiveWelfareResources(subredditId: string): Promise<WelfareResource[]> {
  const { data, error } = await supabase
    .from('welfare_resources')
    .select('*')
    .eq('subreddit_id', subredditId)
    .eq('is_active', true);
  if (error) {
    console.error('Error fetching welfare resources:', error);
    return [];
  }
  return (data ?? []) as WelfareResource[];
}

export async function insertWelfareInjectionLog(entry: Omit<WelfareInjectionLog, 'id' | 'created_at'>): Promise<boolean> {
  const { error } = await supabase
    .from('welfare_injection_log')
    .insert(entry);
  if (error) {
    console.error('Error inserting welfare injection log:', error);
    return false;
  }
  return true;
}

export async function getWelfareInjectionCount(subredditId: string, since: string): Promise<number> {
  const { count, error } = await supabase
    .from('welfare_injection_log')
    .select('*', { count: 'exact', head: true })
    .eq('subreddit_id', subredditId)
    .gte('created_at', since);
  if (error) {
    console.error('Error counting welfare injections:', error);
    return 0;
  }
  return count ?? 0;
}

export async function getFlaggedItemCounts(subredditId: string, since: string): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('flagged_items')
    .select('status')
    .eq('subreddit_id', subredditId)
    .gte('created_at', since);
  if (error || !data) {
    console.error('Error fetching flagged item counts:', error);
    return {};
  }
  const counts: Record<string, number> = { pending: 0, approved: 0, removed: 0, ignored: 0, total: 0 };
  for (const row of data) {
    const s = row.status as string;
    counts[s] = (counts[s] ?? 0) + 1;
    counts.total++;
  }
  return counts;
}

export async function getTopFlaggedTerms(subredditId: string, since: string, limit = 10): Promise<{ term: string; count: number }[]> {
  const { data, error } = await supabase
    .from('flagged_items')
    .select('matched_keywords')
    .eq('subreddit_id', subredditId)
    .gte('created_at', since);
  if (error || !data) {
    console.error('Error fetching flagged terms:', error);
    return [];
  }
  const termCounts: Record<string, number> = {};
  for (const row of data) {
    const keywords = row.matched_keywords as string[] ?? [];
    for (const kw of keywords) {
      termCounts[kw] = (termCounts[kw] ?? 0) + 1;
    }
  }
  return Object.entries(termCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([term, count]) => ({ term, count }));
}

export async function getCategoryBreakdown(subredditId: string, since: string): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('flagged_items')
    .select('matched_rule_id')
    .eq('subreddit_id', subredditId)
    .gte('created_at', since);
  if (error || !data) {
    return {};
  }
  const ruleIds = [...new Set(data.map(r => r.matched_rule_id).filter(Boolean))] as string[];
  if (ruleIds.length === 0) return {};

  const { data: rules } = await supabase
    .from('rules')
    .select('id, category')
    .in('id', ruleIds);
  if (!rules) return {};

  const catMap = Object.fromEntries(rules.map(r => [r.id, r.category]));
  const counts: Record<string, number> = {};
  for (const row of data) {
    const cat = catMap[row.matched_rule_id as string];
    if (cat) counts[cat] = (counts[cat] ?? 0) + 1;
  }
  return counts;
}

export async function insertHealthReport(report: Omit<HealthReport, 'id' | 'created_at'>): Promise<boolean> {
  const { error } = await supabase
    .from('health_reports')
    .insert(report);
  if (error) {
    console.error('Error inserting health report:', error);
    return false;
  }
  return true;
}

export async function getLatestHealthReport(subredditId: string): Promise<HealthReport | null> {
  const { data, error } = await supabase
    .from('health_reports')
    .select('*')
    .eq('subreddit_id', subredditId)
    .order('week_start', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('Error fetching health report:', error);
    return null;
  }
  return data as HealthReport | null;
}

export async function getActiveCrisisMode(subredditId: string): Promise<CrisisModeEntry | null> {
  const { data, error } = await supabase
    .from('crisis_mode_log')
    .select('*')
    .eq('subreddit_id', subredditId)
    .eq('is_active', true)
    .order('activated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('Error fetching crisis mode:', error);
    return null;
  }
  return data as CrisisModeEntry | null;
}

export async function activateCrisisMode(subredditId: string, username: string, durationHours: number, note?: string): Promise<CrisisModeEntry | null> {
  const { data, error } = await supabase
    .from('crisis_mode_log')
    .insert({
      subreddit_id: subredditId,
      activated_by: username,
      duration_hours: durationHours,
      is_active: true,
      note: note ?? null,
    })
    .select()
    .maybeSingle();
  if (error) {
    console.error('Error activating crisis mode:', error);
    return null;
  }
  return data as CrisisModeEntry | null;
}

export async function deactivateCrisisMode(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('crisis_mode_log')
    .update({ is_active: false, deactivated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) {
    console.error('Error deactivating crisis mode:', error);
    return false;
  }
  return true;
}

export async function insertRule(rule: Omit<Rule, 'id' | 'created_at' | 'updated_at'>): Promise<Rule | null> {
  const { data, error } = await supabase
    .from('rules')
    .insert(rule)
    .select()
    .maybeSingle();
  if (error) {
    console.error('Error inserting rule:', error);
    return null;
  }
  return data as Rule | null;
}

export async function insertWelfareResource(resource: Omit<WelfareResource, 'id' | 'created_at'>): Promise<WelfareResource | null> {
  const { data, error } = await supabase
    .from('welfare_resources')
    .insert(resource)
    .select()
    .maybeSingle();
  if (error) {
    console.error('Error inserting welfare resource:', error);
    return null;
  }
  return data as WelfareResource | null;
}

export async function seedDefaultWelfareResources(subredditId: string): Promise<void> {
  const { DEFAULT_WELFARE_RESOURCES } = await import('./types.js');
  const existing = await getActiveWelfareResources(subredditId);
  if (existing.length > 0) return;

  for (const resource of DEFAULT_WELFARE_RESOURCES) {
    await insertWelfareResource({ ...resource, subreddit_id: subredditId });
  }
}

export async function getCrisisModeActivationCount(subredditId: string, since: string): Promise<number> {
  const { count, error } = await supabase
    .from('crisis_mode_log')
    .select('*', { count: 'exact', head: true })
    .eq('subreddit_id', subredditId)
    .gte('activated_at', since);
  if (error) {
    console.error('Error counting crisis activations:', error);
    return 0;
  }
  return count ?? 0;
}

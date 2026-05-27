export type RuleCategory = 'misinformation' | 'self_harm' | 'scam' | 'crisis' | 'other';
export type RuleAction = 'flag' | 'remove' | 'flair' | 'report';
export type ItemStatus = 'pending' | 'approved' | 'removed' | 'ignored';
export type WelfareCategory = 'mental_health' | 'self_harm' | 'homelessness' | 'crisis' | 'substance_abuse' | 'other';

export interface Rule {
  id: string;
  subreddit_id: string;
  name: string;
  category: RuleCategory;
  keywords: string[];
  action: RuleAction;
  threshold: number;
  flair_text?: string;
  is_active: boolean;
}

export interface FlaggedItem {
  id: string;
  subreddit_id: string;
  thing_id: string;
  thing_type: 'post' | 'comment';
  author_name?: string;
  matched_rule_id?: string;
  matched_keywords: string[];
  confidence_score: number;
  context_factors: ContextFactors;
  status: ItemStatus;
  mod_username?: string;
  resolved_at?: string;
  created_at: string;
}

export interface ContextFactors {
  account_age_days: number;
  karma: number;
  prior_removals: number;
  is_new_account: boolean;
  is_low_karma: boolean;
  has_prior_removals: boolean;
}

export interface WelfareResource {
  id: string;
  subreddit_id: string;
  category: WelfareCategory;
  title: string;
  body: string;
  keywords: string[];
  is_active: boolean;
}

export interface WelfareInjectionLog {
  id: string;
  subreddit_id: string;
  thing_id: string;
  resource_id: string;
  category: WelfareCategory;
  created_at: string;
}

export interface HealthReport {
  id: string;
  subreddit_id: string;
  week_start: string;
  total_flagged: number;
  total_approved: number;
  total_removed: number;
  total_ignored: number;
  welfare_injections: number;
  top_flagged_terms: { term: string; count: number }[];
  by_category: Record<string, number>;
  crisis_mode_activations: number;
}

export interface CrisisModeEntry {
  id: string;
  subreddit_id: string;
  activated_by: string;
  activated_at: string;
  deactivated_at?: string;
  duration_hours?: number;
  is_active: boolean;
  note?: string;
}

export interface RuleMatchResult {
  rule: Rule;
  matched_keywords: string[];
  raw_score: number;
  context_adjusted_score: number;
  context_factors: ContextFactors;
}

export const DEFAULT_WELFARE_RESOURCES: Omit<WelfareResource, 'id' | 'subreddit_id'>[] = [
  {
    category: 'mental_health',
    title: 'Mental Health Support',
    body: '**If you or someone you know is struggling with mental health, help is available:**\n\n- **988 Suicide & Crisis Lifeline**: Call or text **988** (US)\n- **Crisis Text Line**: Text HOME to **741741**\n- **SAMHSA National Helpline**: 1-800-662-4357\n- **International Association for Suicide Prevention**: https://www.iasp.info/resources/Crisis_Centres/\n\nYou are not alone. Please reach out to a professional or loved one.',
    keywords: ['depressed', 'depression', 'anxiety', 'mental health', 'therapy', 'therapist', 'counseling', 'cant cope', "can't cope", 'overwhelmed', 'hopeless', 'worthless'],
    is_active: true,
  },
  {
    category: 'self_harm',
    title: 'Self-Harm Resources',
    body: '**If you are having thoughts of self-harm, please reach out now:**\n\n- **988 Suicide & Crisis Lifeline**: Call or text **988** (US)\n- **Crisis Text Line**: Text HOME to **741741**\n- **The Trevor Project** (LGBTQ+): 1-866-488-7386\n- **Self-Harm Hotline**: 1-800-DONT-CUT\n\nYour life matters. Professional help is available right now.',
    keywords: ['self harm', 'self-harm', 'cutting', 'suicide', 'suicidal', 'kill myself', 'end my life', 'want to die', 'hurt myself', 'no reason to live'],
    is_active: true,
  },
  {
    category: 'homelessness',
    title: 'Housing & Homelessness Resources',
    body: '**If you are experiencing homelessness or housing insecurity:**\n\n- **National Alliance to End Homelessness**: https://endhomelessness.org/\n- **211 Hotline**: Dial **2-1-1** for local resources\n- **HUD Resource Locator**: https://www.hud.gov/findshelter\n- **Salvation Army**: https://www.salvationarmyusa.org/\n\nHelp is available. You deserve safe housing.',
    keywords: ['homeless', 'homelessness', 'evicted', 'eviction', 'shelter', 'housing', 'living in car', 'on the street', 'nowhere to go'],
    is_active: true,
  },
  {
    category: 'crisis',
    title: 'Crisis & Disaster Resources',
    body: '**If you are affected by a crisis or disaster:**\n\n- **FEMA**: https://www.fema.gov/\n- **Red Cross**: 1-800-733-2767\n- **Disaster Distress Helpline**: 1-800-985-5990\n- **211 Hotline**: Dial **2-1-1** for local assistance\n\nStay informed through official channels only.',
    keywords: ['disaster', 'hurricane', 'earthquake', 'wildfire', 'flood', 'tornado', 'emergency', 'evacuation', 'crisis help'],
    is_active: true,
  },
  {
    category: 'substance_abuse',
    title: 'Substance Abuse Resources',
    body: '**If you or someone you know is struggling with substance use:**\n\n- **SAMHSA National Helpline**: 1-800-662-4357 (free, confidential, 24/7)\n- **SMART Recovery**: https://www.smartrecovery.org/\n- **Alcoholics Anonymous**: https://www.aa.org/\n- **Narcotics Anonymous**: https://www.na.org/\n\nRecovery is possible. Help is available.',
    keywords: ['addiction', 'alcoholism', 'drug abuse', 'substance abuse', 'overdose', 'detox', 'rehab', 'withdrawal', 'relapse'],
    is_active: true,
  },
];

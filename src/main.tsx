import { Devvit, SettingScope } from '@devvit/public-api';
import './triggers.js';
import './dashboard.js';
import { generateWeeklyReport } from './weekly-report.js';
import { toggleCrisisMode } from './crisis-mode.js';
import { checkAndInjectWelfareResource } from './welfare-injection.js';
import { insertRule, insertWelfareResource } from './supabase.js';
import { evaluateContent } from './rule-engine.js';

Devvit.configure({
  redditAPI: true,
  redis: true,
  http: true,
});

Devvit.addSettings([
  {
    type: 'paragraph',
    name: 'custom_keywords',
    label: 'Custom Concern Keywords (one per line, e.g. "vaccine myth,microchip")',
    helpText: 'Additional keywords to flag beyond your rules. Comma-separated or one per line.',
    scope: SettingScope.Installation,
  },
  {
    type: 'number',
    name: 'default_threshold',
    label: 'Default Confidence Threshold (0-100)',
    helpText: 'Minimum confidence score (as percentage) to auto-action flagged content.',
    scope: SettingScope.Installation,
  },
  {
    type: 'boolean',
    name: 'welfare_injection_enabled',
    label: 'Enable Welfare Resource Injection',
    helpText: 'Automatically post resource comments on posts mentioning distress signals.',
    scope: SettingScope.Installation,
  },
  {
    type: 'boolean',
    name: 'weekly_report_enabled',
    label: 'Enable Weekly Community Health Report',
    helpText: 'Automatically post a weekly digest summarizing community health metrics.',
    scope: SettingScope.Installation,
  },
  {
    type: 'boolean',
    name: 'report_is_public',
    label: 'Make Weekly Reports Public',
    helpText: 'If enabled, reports are visible to all users. Otherwise mod-only.',
    scope: SettingScope.Installation,
  },
  {
    type: 'string',
    name: 'supabase_url',
    label: 'Supabase URL',
    helpText: 'Your Supabase project URL for data persistence.',
    scope: SettingScope.Installation,
  },
  {
    type: 'string',
    name: 'supabase_key',
    label: 'Supabase Anon Key',
    helpText: 'Your Supabase anon key for API access.',
    scope: SettingScope.Installation,
  },
]);

Devvit.addSchedulerJob({
  name: 'weeklyHealthReport',
  onRun: async (_event, context) => {
    const enabled = await context.settings.get<boolean>('weekly_report_enabled');
    if (enabled === false) return;
    await generateWeeklyReport(context);
  },
});

Devvit.addSchedulerJob({
  name: 'deactivateCrisisMode',
  onRun: async (event, context) => {
    const data = event.data as { crisisId: string; subredditId: string } | undefined;
    if (!data) return;
    const { deactivateCrisisMode } = await import('./supabase.js');
    const success = await deactivateCrisisMode(data.crisisId);
    if (success) {
      await context.redis.del('civicguard:crisis_mode:' + data.subredditId);
    }
  },
});

Devvit.addSchedulerJob({
  name: 'welfareCheck',
  onRun: async (_event, context) => {
    const enabled = await context.settings.get<boolean>('welfare_injection_enabled');
    if (enabled === false) return;

    const subredditName = await context.reddit.getCurrentSubredditName();
    const posts = await context.reddit.getNewPosts({
      subredditName,
      limit: 10,
    }).all();

    for (const post of posts) {
      const text = post.title + ' ' + (post.body ?? '');
      await checkAndInjectWelfareResource(text, post.id, context.subredditId, context);
    }
  },
});

Devvit.addMenuItem({
  label: 'Open CivicGuard Dashboard',
  location: 'subreddit',
  onPress: async (_event, context) => {
    const subredditName = await context.reddit.getCurrentSubredditName();
    const post = await context.reddit.submitPost({
      subredditName,
      title: 'CivicGuard Mod Dashboard',
      preview: (
        <vstack height="100%" alignment="middle center" backgroundColor="#1A5632">
          <text size="xxlarge" weight="bold" color="#FFFFFF">CivicGuard</text>
          <text size="medium" color="#E8F5E9">Loading dashboard...</text>
        </vstack>
      ),
    });
    context.ui.showToast('Dashboard created');
    context.ui.navigateTo(post);
  },
});

Devvit.addMenuItem({
  label: 'CivicGuard: Activate Crisis Mode',
  location: 'subreddit',
  onPress: async (_event, context) => {
    const username = context.username ?? 'unknown';
    const result = await toggleCrisisMode(context.subredditId, username, true, 24, undefined, context);
    context.ui.showToast(result.message);
  },
});

Devvit.addMenuItem({
  label: 'CivicGuard: Deactivate Crisis Mode',
  location: 'subreddit',
  onPress: async (_event, context) => {
    const username = context.username ?? 'unknown';
    const result = await toggleCrisisMode(context.subredditId, username, false, 0, undefined, context);
    context.ui.showToast(result.message);
  },
});

Devvit.addMenuItem({
  label: 'CivicGuard: Scan Post for Concerns',
  location: 'post',
  onPress: async (event, context) => {
    const postId = event.targetId;
    const post = await context.reddit.getPostById(postId);
    const text = post.title + ' ' + (post.body ?? '');
    const results = await evaluateContent(text, context.subredditId, post.authorId, post.authorName, context.subredditName, context.reddit);

    if (results.length === 0) {
      context.ui.showToast('No concerns detected for this post.');
      return;
    }

    const topResult = results[0];
    const score = (topResult.context_adjusted_score * 100).toFixed(0);
    context.ui.showToast('Flagged: ' + topResult.rule.name + ' (' + score + '% confidence)');
  },
});

Devvit.addMenuItem({
  label: 'CivicGuard: Add Quick Rule',
  location: 'subreddit',
  onPress: async (_event, context) => {
    context.ui.showForm(addQuickRuleForm);
  },
});

const addQuickRuleForm = Devvit.createForm(
  {
    fields: [
      { type: 'string', name: 'name', label: 'Rule Name', required: true },
      {
        type: 'select',
        name: 'category',
        label: 'Category',
        options: [
          { label: 'Misinformation', value: 'misinformation' },
          { label: 'Self-Harm', value: 'self_harm' },
          { label: 'Scam', value: 'scam' },
          { label: 'Crisis', value: 'crisis' },
          { label: 'Other', value: 'other' },
        ],
        required: true,
      },
      { type: 'paragraph', name: 'keywords', label: 'Keywords (comma-separated)', required: true },
      {
        type: 'select',
        name: 'action',
        label: 'Action',
        options: [
          { label: 'Flag (add to queue)', value: 'flag' },
          { label: 'Remove automatically', value: 'remove' },
          { label: 'Apply flair', value: 'flair' },
          { label: 'Report to mods', value: 'report' },
        ],
        required: true,
      },
      {
        type: 'number',
        name: 'threshold',
        label: 'Confidence Threshold (0-100, default 50)',
      },
    ],
  },
  async (event, context) => {
    const values = event.values;
    const keywords = (values.keywords as string)
      .split(',')
      .map((k: string) => k.trim())
      .filter(Boolean);

    const threshold = ((values.threshold as number) ?? 50) / 100;

    await insertRule({
      subreddit_id: context.subredditId,
      name: values.name as string,
      category: (values.category as string[])[0] as any,
      keywords,
      action: (values.action as string[])[0] as any,
      threshold,
      is_active: true,
    });

    context.ui.showToast('Rule "' + (values.name as string) + '" created with ' + keywords.length + ' keywords');
  }
);

Devvit.addMenuItem({
  label: 'CivicGuard: Add Welfare Resource',
  location: 'subreddit',
  onPress: async (_event, context) => {
    context.ui.showForm(addWelfareResourceForm);
  },
});

const addWelfareResourceForm = Devvit.createForm(
  {
    fields: [
      { type: 'string', name: 'title', label: 'Resource Title', required: true },
      {
        type: 'select',
        name: 'category',
        label: 'Category',
        options: [
          { label: 'Mental Health', value: 'mental_health' },
          { label: 'Self-Harm', value: 'self_harm' },
          { label: 'Homelessness', value: 'homelessness' },
          { label: 'Crisis', value: 'crisis' },
          { label: 'Substance Abuse', value: 'substance_abuse' },
          { label: 'Other', value: 'other' },
        ],
        required: true,
      },
      { type: 'paragraph', name: 'body', label: 'Comment Body (supports markdown)', required: true },
      { type: 'paragraph', name: 'keywords', label: 'Trigger Keywords (comma-separated)', required: true },
    ],
  },
  async (event, context) => {
    const values = event.values;
    const keywords = (values.keywords as string)
      .split(',')
      .map((k: string) => k.trim())
      .filter(Boolean);

    await insertWelfareResource({
      subreddit_id: context.subredditId,
      title: values.title as string,
      category: (values.category as string[])[0] as any,
      body: values.body as string,
      keywords,
      is_active: true,
    });

    context.ui.showToast('Welfare resource "' + (values.title as string) + '" created');
  }
);

Devvit.addTrigger({
  event: 'AppInstall',
  onEvent: async (_event, context) => {
    try {
      await context.scheduler.runJob({
        name: 'weeklyHealthReport',
        cron: '0 9 * * 1',
      });
    } catch (e) {
      console.error('Error scheduling weekly report:', e);
    }

    try {
      await context.scheduler.runJob({
        name: 'welfareCheck',
        cron: '*/5 * * * *',
      });
    } catch (e) {
      console.error('Error scheduling welfare check:', e);
    }
  },
});

Devvit.addTrigger({
  event: 'AppUpgrade',
  onEvent: async (_event, context) => {
    try {
      const jobs = await context.scheduler.listJobs();
      const hasWeekly = jobs.some(j => j.name === 'weeklyHealthReport');
      const hasWelfare = jobs.some(j => j.name === 'welfareCheck');

      if (!hasWeekly) {
        await context.scheduler.runJob({ name: 'weeklyHealthReport', cron: '0 9 * * 1' });
      }
      if (!hasWelfare) {
        await context.scheduler.runJob({ name: 'welfareCheck', cron: '*/5 * * * *' });
      }
    } catch (e) {
      console.error('Error rescheduling jobs on upgrade:', e);
    }
  },
});

export default Devvit;

import { Devvit } from '@devvit/public-api';
import { evaluateContent } from './rule-engine.js';
import { insertFlaggedItem } from './supabase.js';
import type { FlaggedItem } from './types.js';
import type { TriggerContext } from '@devvit/public-api/types/triggers.js';

Devvit.configure({
  redditAPI: true,
  redis: true,
  http: true,
});

async function handleContentSubmission(
  thingId: string,
  text: string,
  subredditId: string,
  authorId: string | undefined,
  authorName: string | undefined,
  subredditName: string | undefined,
  thingType: 'post' | 'comment',
  context: TriggerContext
): Promise<void> {
  const matchResults = await evaluateContent(text, subredditId, authorId, authorName, subredditName, context.reddit);

  if (matchResults.length === 0) return;

  const topMatch = matchResults[0];

  const flaggedItem: Omit<FlaggedItem, 'id' | 'created_at'> = {
    subreddit_id: subredditId,
    thing_id: thingId,
    thing_type: thingType,
    author_name: authorName,
    matched_rule_id: topMatch.rule.id,
    matched_keywords: topMatch.matched_keywords,
    confidence_score: topMatch.context_adjusted_score,
    context_factors: topMatch.context_factors,
    status: 'pending',
  };

  await insertFlaggedItem(flaggedItem);

  if (topMatch.rule.action === 'remove' && topMatch.context_adjusted_score >= topMatch.rule.threshold) {
    try {
      await context.reddit.remove(thingId as any, false);
      await context.reddit.addModNote({
        subreddit: subredditName ?? '',
        user: authorName ?? '',
        redditId: thingId as any,
        note: 'CivicGuard auto-removed: rule "' + topMatch.rule.name + '" (score: ' + topMatch.context_adjusted_score.toFixed(2) + ')',
        label: 'SPAM_WARNING',
      });
    } catch (e) {
      console.error('Error auto-removing content:', e);
    }
  } else if (topMatch.rule.action === 'flair' && topMatch.rule.flair_text) {
    try {
      const subName = subredditName ?? await context.reddit.getCurrentSubredditName();
      await context.reddit.setPostFlair({
        subredditName: subName,
        postId: thingId as any,
        text: topMatch.rule.flair_text,
      });
    } catch (e) {
      console.error('Error setting flair:', e);
    }
  } else if (topMatch.rule.action === 'report') {
    try {
      const post = await context.reddit.getPostById(thingId as any);
      await context.reddit.report(post, { reason: 'CivicGuard: rule "' + topMatch.rule.name + '"' });
    } catch (e) {
      console.error('Error reporting content:', e);
    }
  }

  await context.redis.set('civicguard:last_flag:' + subredditId, new Date().toISOString());
}

Devvit.addTrigger({
  events: ['PostSubmit', 'CommentSubmit'],
  onEvent: async (event, context) => {
    if (event.type === 'PostSubmit') {
      const e = event as any;
      const post = e.post ?? {};
      const text = (post.title ?? '') + ' ' + (post.selftext ?? '');
      const authorId = e.author?.id ?? post.authorId;
      const authorName = e.author?.name ?? post.authorName;
      await handleContentSubmission(
        post.id ?? '',
        text,
        context.subredditId,
        authorId,
        authorName,
        context.subredditName,
        'post',
        context
      );
    } else if (event.type === 'CommentSubmit') {
      const e = event as any;
      const comment = e.comment ?? {};
      const authorId = e.author?.id ?? comment.authorId;
      const authorName = e.author?.name ?? comment.authorName;
      await handleContentSubmission(
        comment.id ?? '',
        comment.body ?? '',
        context.subredditId,
        authorId,
        authorName,
        context.subredditName,
        'comment',
        context
      );
    }
  },
});

Devvit.addTrigger({
  event: 'AppInstall',
  onEvent: async (_event, context) => {
    const { seedDefaultWelfareResources } = await import('./supabase.js');
    await seedDefaultWelfareResources(context.subredditId);
  },
});

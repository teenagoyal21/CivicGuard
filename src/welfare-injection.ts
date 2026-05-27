import { getActiveWelfareResources, insertWelfareInjectionLog } from './supabase.js';
import type { WelfareResource } from './types.js';
import type { JobContext } from '@devvit/public-api/types/scheduler.js';

export async function checkAndInjectWelfareResource(
  text: string,
  thingId: string,
  subredditId: string,
  context: JobContext
): Promise<boolean> {
  const resources = await getActiveWelfareResources(subredditId);
  if (resources.length === 0) return false;

  const lowerText = text.toLowerCase();
  const matched: WelfareResource[] = [];

  for (const resource of resources) {
    for (const kw of resource.keywords) {
      const pattern = new RegExp('\\b' + escapeRegex(kw.toLowerCase()) + '\\b', 'i');
      if (pattern.test(lowerText)) {
        matched.push(resource);
        break;
      }
    }
  }

  if (matched.length === 0) return false;

  // Check if we already injected a welfare comment on this thing (Redis dedup)
  const dedupKey = 'civicguard:welfare_injected:' + thingId;
  const alreadyInjected = await context.redis.get(dedupKey);
  if (alreadyInjected) return false;

  // Inject the first matched resource as a comment
  const resource = matched[0];
  try {
    await context.reddit.submitComment({
      id: thingId,
      text: resource.body,
    });

    // Mark as injected with 24h TTL
    await context.redis.set(dedupKey, resource.id, { expiration: new Date(Date.now() + 24 * 60 * 60 * 1000) });

    // Log the injection for impact measurement
    await insertWelfareInjectionLog({
      subreddit_id: subredditId,
      thing_id: thingId,
      resource_id: resource.id,
      category: resource.category,
    });

    return true;
  } catch (e) {
    console.error('Error injecting welfare resource comment:', e);
    return false;
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

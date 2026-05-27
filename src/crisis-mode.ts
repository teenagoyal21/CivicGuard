import { activateCrisisMode, deactivateCrisisMode, getActiveCrisisMode } from './supabase.js';
import type { Devvit } from '@devvit/public-api';

type AppContext = Devvit.Context;

export async function toggleCrisisMode(
  subredditId: string,
  username: string,
  enable: boolean,
  durationHours: number,
  note: string | undefined,
  context: AppContext
): Promise<{ success: boolean; message: string }> {
  if (enable) {
    const existing = await getActiveCrisisMode(subredditId);
    if (existing) {
      return { success: false, message: 'Crisis Mode is already active' };
    }

    const entry = await activateCrisisMode(subredditId, username, durationHours, note);
    if (!entry) {
      return { success: false, message: 'Failed to activate Crisis Mode' };
    }

    await context.redis.set(
      'civicguard:crisis_mode:' + subredditId,
      JSON.stringify({ active: true, activatedAt: entry.activated_at, thresholdReduction: 0.8 })
    );

    if (durationHours > 0) {
      await context.scheduler.runJob({
        name: 'deactivateCrisisMode',
        data: { crisisId: entry.id, subredditId },
        runAt: new Date(Date.now() + durationHours * 60 * 60 * 1000),
      });
    }

    return { success: true, message: 'Crisis Mode activated for ' + durationHours + 'h by ' + username };
  } else {
    const existing = await getActiveCrisisMode(subredditId);
    if (!existing) {
      return { success: false, message: 'Crisis Mode is not currently active' };
    }

    const success = await deactivateCrisisMode(existing.id);
    if (!success) {
      return { success: false, message: 'Failed to deactivate Crisis Mode' };
    }

    await context.redis.del('civicguard:crisis_mode:' + subredditId);

    return { success: true, message: 'Crisis Mode deactivated' };
  }
}

export async function isCrisisModeActive(subredditId: string, context: AppContext): Promise<boolean> {
  const cached = await context.redis.get('civicguard:crisis_mode:' + subredditId);
  if (cached) {
    try {
      const data = JSON.parse(cached) as { active: boolean };
      return data.active;
    } catch {
      // Fall through to DB check
    }
  }
  const entry = await getActiveCrisisMode(subredditId);
  return entry !== null;
}
